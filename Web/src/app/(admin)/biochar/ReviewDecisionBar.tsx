"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ReviewDecisionOption<T extends string> = {
  value: T;
  shortLabel: string;
  selectedClass: string;
  icon: ReactNode;
};

export default function ReviewDecisionBar<T extends string>({
  decision,
  options,
  reviewerNotes,
  submitting,
  onDecisionChange,
  onNotesChange,
  onSubmit,
}: {
  decision: T;
  options: ReviewDecisionOption<T>[];
  reviewerNotes: string;
  submitting: boolean;
  onDecisionChange: (decision: T) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (reviewerNotes.trim()) setNotesOpen(true);
  }, [reviewerNotes]);

  const hasNotes = reviewerNotes.trim().length > 0;

  return (
    <div className="space-y-2 border-t border-neutral-100 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div
          className="grid min-w-0 flex-1 gap-0.5 rounded-lg bg-neutral-100/90 p-0.5"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
          {options.map((option) => {
            const selected = decision === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onDecisionChange(option.value)}
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  selected
                    ? option.selectedClass
                    : "text-neutral-500 hover:bg-white/60 hover:text-neutral-700"
                }`}
              >
                <span className={selected ? "opacity-100" : "opacity-60"}>{option.icon}</span>
                <span className="truncate">{option.shortLabel}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="shrink-0 rounded-lg bg-brand-dark px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setNotesOpen((open) => !open)}
        className="flex items-center gap-1 text-xs text-neutral-500 transition hover:text-neutral-700"
      >
        <svg
          className={`h-3 w-3 transition-transform ${notesOpen ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {notesOpen ? "Hide note" : hasNotes ? "Edit note" : "Add note (optional)"}
      </button>

      {notesOpen ? (
        <textarea
          value={reviewerNotes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Review note…"
          rows={2}
          className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-brand-dark/30 focus:outline-none focus:ring-2 focus:ring-brand-dark/10"
        />
      ) : null}
    </div>
  );
}

export const REVIEW_DECISION_ICONS = {
  approve: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reject: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  onHold: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 9v6M14 9v6" strokeLinecap="round" />
      <rect x="6" y="4" width="12" height="16" rx="2" />
    </svg>
  ),
} as const;

export const REVIEW_DECISION_STYLES = {
  approve: "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100",
  reject: "bg-white text-red-600 shadow-sm ring-1 ring-red-100",
  onHold: "bg-white text-amber-700 shadow-sm ring-1 ring-amber-100",
} as const;
