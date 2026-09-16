"use client";

import { useState, type ChangeEvent } from "react";
import { createFarmerConsent } from "./actions";
import { uploadFarmerNetworkPhoto } from "@/lib/uploadFarmerNetworkPhotos";

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";

function todayPlusYears(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

interface ConsentCreateFormProps {
  farmerId: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ConsentCreateForm({
  farmerId,
  onSaved,
  onCancel,
}: ConsentCreateFormProps) {
  const [consentDate, setConsentDate] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState(todayPlusYears(1));
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!consentDate) {
      setError("Signed date is required.");
      return;
    }
    if (!validTo) {
      setError("Document expiry date is required.");
      return;
    }
    if (files.length < 1) {
      setError("Upload at least one document photo.");
      return;
    }
    if (files.length > 2) {
      setError("Maximum 2 document photos.");
      return;
    }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const photos: string[] = [];
      for (const file of files) {
        photos.push(
          await uploadFarmerNetworkPhoto({ file, folder: `consents/${id}` }),
        );
      }
      await createFarmerConsent({
        id,
        farm_id: farmerId,
        agreement_type: "Farmer consent",
        consent_status: "active",
        consent_date: consentDate,
        valid_to: validTo,
        photos,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save consent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Record the signed date, expiry date, and photos of the signed consent.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass}>Signed date *</label>
          <input type="date" className={inputClass} value={consentDate} onChange={(e) => setConsentDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>Expiry date *</label>
          <input type="date" className={inputClass} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Document photos * (1–2)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFiles(Array.from(e.target.files ?? []).slice(0, 2))
          }
          className="block w-full text-sm"
        />
      </div>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save consent"}
        </button>
      </div>
    </div>
  );
}
