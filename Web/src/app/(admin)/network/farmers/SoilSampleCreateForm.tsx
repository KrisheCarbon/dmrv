"use client";

import { useState, type ChangeEvent } from "react";
import { createSoilTest } from "../soil-tests/actions";
import { uploadFarmerNetworkPhoto } from "@/lib/uploadFarmerNetworkPhotos";
import type { FarmFieldRecord } from "@krishecarbon/shared";

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20";
const labelClass = "text-sm font-medium text-neutral-700";

interface SoilSampleCreateFormProps {
  farmerId: string;
  fields: FarmFieldRecord[];
  latitude?: number | null;
  longitude?: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function SoilSampleCreateForm({
  farmerId,
  fields,
  latitude,
  longitude,
  onSaved,
  onCancel,
}: SoilSampleCreateFormProps) {
  const activeFields = fields.filter((field) => field.status !== "inactive");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleField(id: string) {
    setFieldIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setError(null);
    if (fieldIds.length === 0) {
      setError("Select one or more farms for this soil sample.");
      return;
    }
    if (!photo) {
      setError("Upload a sample photo.");
      return;
    }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const samplePhotoUrl = await uploadFarmerNetworkPhoto({
        file: photo,
        folder: `soil-tests/${id}`,
      });
      await createSoilTest({
        id,
        farm_id: farmerId,
        field_ids: fieldIds,
        sample_date: sampleDate,
        sample_lat: latitude ?? null,
        sample_lng: longitude ?? null,
        sample_photo_url: samplePhotoUrl,
        status: "accepted",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sample");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Pick the farm(s) this sample belongs to, then attach the sample photo.
      </p>
      {activeFields.length === 0 ? (
        <p className="text-sm text-amber-800">
          Add a farm for this farmer before collecting a soil sample.
        </p>
      ) : (
        <div className="space-y-2">
          <p className={labelClass}>Farms *</p>
          {activeFields.map((field) => (
            <label key={field.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fieldIds.includes(field.id)}
                onChange={() => toggleField(field.id)}
              />
              {field.field_code} · {field.ownership_type} · {field.calculated_area ?? "?"} ac
            </label>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelClass}>Sample date</label>
        <input type="date" className={inputClass} value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>Sample photo *</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setPhoto(e.target.files?.[0] ?? null)
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
          disabled={saving || activeFields.length === 0}
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save sample"}
        </button>
      </div>
    </div>
  );
}
