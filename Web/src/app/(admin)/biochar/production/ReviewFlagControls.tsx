"use client";

import {
  PYROLYSIS_BATCH_STATUS_FLAG_VALUES,
  pyrolysisBatchStatusFlagValueLabel,
  type PyrolysisBatchStatusFlagValue,
} from "@krishecarbon/shared";

export type FlagDraft = {
  status: PyrolysisBatchStatusFlagValue;
  notes: string;
};

export function emptyFlagDraft(): FlagDraft {
  return { status: "accepted", notes: "" };
}

export default function ReviewFlagControls({
  label,
  value,
  onChange,
  compact = false,
}: {
  label?: string;
  value: FlagDraft;
  onChange: (next: FlagDraft) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {label ? (
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {PYROLYSIS_BATCH_STATUS_FLAG_VALUES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onChange({ ...value, status })}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              value.status === status
                ? "bg-brand-dark text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {pyrolysisBatchStatusFlagValueLabel(status)}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value.notes}
        onChange={(event) => onChange({ ...value, notes: event.target.value })}
        placeholder="Comment"
        className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400"
      />
    </div>
  );
}
