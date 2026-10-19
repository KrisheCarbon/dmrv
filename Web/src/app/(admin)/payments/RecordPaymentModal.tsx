"use client";

import { useState, type FormEvent } from "react";
import FileDrop from "@/components/FileDrop";
import Modal from "@/components/Modal";
import { formatRoleLabel } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { recordPayment } from "./actions";
import {
  PAYMENT_PROOF_BUCKET,
  formatInr,
  type PaymentOptions,
} from "./paymentsLib";

const inputClass =
  "min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-950";

function localDateInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

interface RecordPaymentModalProps {
  open: boolean;
  options: PaymentOptions | null;
  payeeId: string | null;
  balance: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RecordPaymentModal({
  open,
  options,
  payeeId,
  balance,
  onClose,
  onSaved,
}: RecordPaymentModalProps) {
  const [selectedPayee, setSelectedPayee] = useState(payeeId ?? "");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(localDateInput);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payee = selectedPayee || payeeId || "";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!payee) {
      setError("Choose who was paid.");
      return;
    }
    if (!file) {
      setError("Upload a screenshot, invoice, or other proof.");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter the amount that was paid.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setError("Upload a PDF or a photo (JPG, PNG, or WEBP).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("The file must be 20 MB or smaller.");
      return;
    }

    setSaving(true);
    try {
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "proof";
      const path = `${payee}/${crypto.randomUUID()}/${clean}`;
      const { error: uploadError } = await supabase.storage
        .from(PAYMENT_PROOF_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      await recordPayment({
        payee_id: payee,
        amount_inr: parsed,
        paid_on: paidOn,
        note: note.trim() || null,
        proof_path: path,
        proof_name: file.name,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 rounded-xl border border-neutral-300 px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="record-payment"
            disabled={saving}
            className="min-h-14 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save payment"}
          </button>
        </div>
      }
    >
      <form id="record-payment" onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-neutral-500">
          Enter the money that was transferred. The proof file is kept with the record so the
          payment can be checked later.
          {balance != null ? ` Still to pay for this person: ${formatInr(balance)}.` : ""}
        </p>
        {error ? (
          <div className="rounded-xl border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error">
            {error}
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-700">Paid to</span>
          <select
            className={inputClass}
            value={payee}
            onChange={(event) => setSelectedPayee(event.target.value)}
            required
          >
            <option value="">Select a climapreneur or supervisor</option>
            {(options?.payees ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {formatRoleLabel(person.role)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-700">Amount (INR)</span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-700">Paid on</span>
            <input
              type="date"
              className={inputClass}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
              required
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-700">Note</span>
          <input
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="UPI, bank transfer, or invoice number"
          />
        </label>
        <FileDrop
          label="Proof"
          hint="PDF, JPG, PNG, or WEBP. One file, up to 20 MB."
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          files={file ? [file] : []}
          onChange={(next) => setFile(next[0] ?? null)}
        />
      </form>
    </Modal>
  );
}
