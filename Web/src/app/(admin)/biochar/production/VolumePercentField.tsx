"use client";

import { useEffect, useState } from "react";
import { updatePyrolysisBatchVolumePercent } from "./actions";
import type { PyrolysisBatchDetail } from "./productionLib";

function formatAmount(value: number | null | undefined, unit: string) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

export default function VolumePercentField({
  batch,
  onSaved,
}: {
  batch: PyrolysisBatchDetail;
  onSaved?: (batch: PyrolysisBatchDetail) => void;
}) {
  const [draft, setDraft] = useState(
    batch.volume_percent != null ? String(batch.volume_percent) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(batch.volume_percent != null ? String(batch.volume_percent) : "");
  }, [batch.volume_percent]);

  async function handleSave() {
    const trimmed = draft.trim();
    let value: number | null = null;
    if (trimmed !== "") {
      value = Number(trimmed);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError("Volume percent must be between 0 and 100.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updatePyrolysisBatchVolumePercent(batch.id, value);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save volume percent");
    } finally {
      setSaving(false);
    }
  }

  const missingCapacity = batch.kontikki_capacity_liters == null;
  const missingDensity = batch.biochar_bulk_density_kg_m3 == null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={saving}
          className="w-24 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
          aria-label="Volume percent"
        />
        <span className="text-sm text-neutral-500">%</span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="min-h-12 rounded-xl bg-brand-dark px-4 text-sm font-medium text-white hover:bg-brand-dark-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-sm text-neutral-700">
        Estimated biochar: {formatAmount(batch.estimated_biochar_volume_liters, "L")}
        {" · "}
        {formatAmount(batch.estimated_biochar_mass_kg, "kg")}
      </p>
      <p className="text-xs text-neutral-500">
        Kiln capacity {formatAmount(batch.kontikki_capacity_liters, "L")}. Feedstock bulk
        density {formatAmount(batch.biochar_bulk_density_kg_m3, "kg/m³")}. Volume is this
        percent of the kiln. Mass is that volume times the catalog density. This is an
        estimate until Rainbow confirms the method.
        {missingCapacity ? " This kontikki has no capacity, so the volume stays blank." : ""}
        {missingDensity ? " This feedstock has no bulk density, so the mass stays blank." : ""}
      </p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
