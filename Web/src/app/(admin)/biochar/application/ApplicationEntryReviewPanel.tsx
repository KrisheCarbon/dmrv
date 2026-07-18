"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  APPLICATION_ENTRY_MEDIA_KEYS,
  type ApplicationEntryReviewDecision,
  type SubmitApplicationEntryStatusPayload,
} from "@krishecarbon/shared";
import StatusBadge from "../production/StatusBadge";
import {
  canCurrentUserReviewApplicationEntries,
  getApplicationEntry,
  submitApplicationEntryStatus,
} from "./actions";
import ApplicationEntryDetailView from "./ApplicationEntryDetailView";
import ApplicationReviewDecisionBar from "./ApplicationReviewDecisionBar";
import {
  formatDateTime,
  formatMediaType,
  formatReviewStatus,
  mediaFlagMap,
  resolveReviewStatus,
  reviewStatusTone,
  type ApplicationEntryDetail,
} from "./applicationLib";

export default function ApplicationEntryReviewPanel({
  entryId,
  onClose,
  onSubmitted,
  embedded = false,
  fullPage = false,
}: {
  entryId: string;
  onClose?: () => void;
  onSubmitted?: (entry: ApplicationEntryDetail) => void;
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const [data, setData] = useState<ApplicationEntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [decision, setDecision] = useState<ApplicationEntryReviewDecision>("approved");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [mediaFlagged, setMediaFlagged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [entry, reviewAllowed] = await Promise.all([
          getApplicationEntry(entryId),
          canCurrentUserReviewApplicationEntries(),
        ]);

        if (cancelled) return;

        setData(entry);
        setCanReview(reviewAllowed);
        setMediaFlagged(mediaFlagMap(entry).has(APPLICATION_ENTRY_MEDIA_KEYS[0]));
        setReviewerNotes(entry.entry_status?.reviewer_notes ?? "");

        const currentStatus = resolveReviewStatus(entry);
        if (currentStatus !== "pending_review") {
          setDecision(currentStatus as ApplicationEntryReviewDecision);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load application entry");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const payload = useMemo<SubmitApplicationEntryStatusPayload | null>(() => {
    if (!data) return null;
    return {
      status: decision,
      reviewer_notes: reviewerNotes.trim() || null,
      media_flags: APPLICATION_ENTRY_MEDIA_KEYS.map((mediaKey) => ({
        media_key: mediaKey,
        flagged: mediaFlagged,
      })),
    };
  }, [data, decision, reviewerNotes, mediaFlagged]);

  async function handleSubmit() {
    if (!payload) return;

    setSubmitting(true);
    setError(null);

    try {
      const updated = await submitApplicationEntryStatus(entryId, payload);
      setData(updated);
      onSubmitted?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
        Loading application entry...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-red-600">{error}</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-brand-dark hover:underline"
          >
            Close
          </button>
        ) : null}
      </div>
    );
  }

  if (!data) return null;

  const currentStatus = resolveReviewStatus(data);

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "space-y-4"}>
      <div className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={
                  embedded
                    ? "truncate text-base font-semibold text-neutral-950"
                    : "text-2xl font-semibold tracking-tight text-neutral-950"
                }
              >
                {formatDateTime(data.applied_at)}
              </h2>
              <StatusBadge
                label={formatReviewStatus(currentStatus)}
                tone={reviewStatusTone(currentStatus)}
              />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {data.farm_name ?? "Farm not set"} · {formatMediaType(data)} ·{" "}
              {data.operator_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!fullPage ? (
              <Link
                href={`/biochar/application/${entryId}`}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-dark hover:bg-neutral-100"
              >
                Open
              </Link>
            ) : (
              <Link
                href="/biochar/application"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-brand-dark"
              >
                List
              </Link>
            )}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close panel"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {canReview ? (
          <ApplicationReviewDecisionBar
            decision={decision}
            reviewerNotes={reviewerNotes}
            submitting={submitting}
            onDecisionChange={setDecision}
            onNotesChange={setReviewerNotes}
            onSubmit={handleSubmit}
          />
        ) : null}

        {error ? (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className={embedded ? "min-h-0 flex-1 overflow-y-auto px-4 py-3" : "px-0"}>
        <ApplicationEntryDetailView
          data={data}
          canReview={canReview}
          mediaLayout={embedded && !fullPage ? "drawer" : "page"}
          mediaFlagged={mediaFlagged}
          onMediaFlagChange={setMediaFlagged}
        />
      </div>
    </div>
  );
}
