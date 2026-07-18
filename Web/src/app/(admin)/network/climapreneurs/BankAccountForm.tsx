"use client";

import { useState } from "react";
import {
  upsertClimapreneurBankAccount,
  type BankAccountSavePayload,
} from "./actions";
import type { ClimapreneurBankAccount } from "@/types";

interface BankAccountFormProps {
  climapreneurId: string;
  data?: ClimapreneurBankAccount | null;
  embedded?: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

interface BankAccountFormState {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  bank_address: string;
  upi_id: string;
}

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";

function bankAccountToFormState(
  account: ClimapreneurBankAccount,
): BankAccountFormState {
  return {
    account_holder_name: account.account_holder_name,
    account_number: account.account_number,
    ifsc_code: account.ifsc_code,
    bank_name: account.bank_name,
    branch: account.branch,
    bank_address: account.bank_address,
    upi_id: account.upi_id ?? "",
  };
}

export default function BankAccountForm({
  climapreneurId,
  data = null,
  embedded = false,
  onCancel,
  onSuccess,
}: BankAccountFormProps) {
  const isEdit = Boolean(data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<BankAccountFormState>(() =>
    data
      ? bankAccountToFormState(data)
      : {
          account_holder_name: "",
          account_number: "",
          ifsc_code: "",
          bank_name: "",
          branch: "",
          bank_address: "",
          upi_id: "",
        },
  );

  function updateField<K extends keyof BankAccountFormState>(
    key: K,
    value: BankAccountFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);

    if (
      !form.account_holder_name.trim() ||
      !form.account_number.trim() ||
      !form.ifsc_code.trim() ||
      !form.bank_name.trim() ||
      !form.branch.trim() ||
      !form.bank_address.trim()
    ) {
      setError("Please fill all required bank fields.");
      return;
    }

    setLoading(true);

    try {
      const payload: BankAccountSavePayload = {
        account_holder_name: form.account_holder_name.trim(),
        account_number: form.account_number.trim(),
        ifsc_code: form.ifsc_code.trim(),
        bank_name: form.bank_name.trim(),
        branch: form.branch.trim(),
        bank_address: form.bank_address.trim(),
        upi_id: form.upi_id.trim() || null,
      };

      await upsertClimapreneurBankAccount(climapreneurId, payload);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save bank details",
      );
      setLoading(false);
    }
  }

  return (
    <div
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40"
      }
    >
      {!embedded ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
            Banking
          </p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">
            {isEdit ? "Update bank details" : "Add bank details"}
          </h3>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass}>Account holder name *</label>
          <input
            className={inputClass}
            value={form.account_holder_name}
            onChange={(e) => updateField("account_holder_name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Account number *</label>
          <input
            className={inputClass}
            value={form.account_number}
            onChange={(e) => updateField("account_number", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>IFSC code *</label>
          <input
            className={`${inputClass} uppercase`}
            value={form.ifsc_code}
            onChange={(e) => updateField("ifsc_code", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Bank name *</label>
          <input
            className={inputClass}
            value={form.bank_name}
            onChange={(e) => updateField("bank_name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Branch *</label>
          <input
            className={inputClass}
            value={form.branch}
            onChange={(e) => updateField("branch", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Bank address / location *</label>
          <input
            className={inputClass}
            value={form.bank_address}
            onChange={(e) => updateField("bank_address", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className={labelClass}>UPI ID</label>
          <input
            className={inputClass}
            placeholder="name@upi (optional)"
            value={form.upi_id}
            onChange={(e) => updateField("upi_id", e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover disabled:opacity-50"
        >
          {loading ? "Saving..." : isEdit ? "Save changes" : "Add bank details"}
        </button>
      </div>
    </div>
  );
}
