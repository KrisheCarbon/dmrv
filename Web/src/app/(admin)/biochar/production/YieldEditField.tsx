"use client";

import { useEffect, useState } from "react";
import { updatePyrolysisBatchYield } from "./actions";
import type { PyrolysisBatchDetail } from "./productionLib";

function formatYield(value: number | null | undefined) {
  return value != null ? `${value}%` : "—";
}

export default function YieldEditField({
  batchId,
  yieldPercent,
  canEdit,
  onSaved,
}: {
  batchId: string;
  yieldPercent?: number | null;
  canEdit: boolean;
  onSaved?: (batch: PyrolysisBatchDetail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    yieldPercent != null ? String(yieldPercent) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(yieldPercent != null ? String(yieldPercent) : "");
      setError(null);
    }
  }, [yieldPercent, editing]);

  if (!canEdit) {
    return <>{formatYield(yieldPercent)}</>;
  }

  async function handleSave() {
    const parsed = Number(draft.trim());
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setError("Enter a numeric yield percent.");
      return;
    }
    if (parsed < 0 || parsed > 100) {
      setError("Yield must be between 0 and 100.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await updatePyrolysisBatchYield(batchId, parsed);
      setEditing(false);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update yield");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{formatYield(yieldPercent)}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-brand-dark hover:underline"
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
            if (event.key === "Escape") setEditing(false);
          }}
          disabled={saving}
          className="w-24 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900 focus:border-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-dark"
          aria-label="Yield percent"
          autoFocus
        />
        <span className="text-sm text-neutral-500">%</span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-brand-dark px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
