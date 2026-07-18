"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PYROLYSIS_BATCH_STATUS_SECTION_KEYS,
  photosForBatchStatusSection,
  type PyrolysisBatchStatusFlag,
  type SubmitPyrolysisBatchStatusPayload,
} from "@krishecarbon/shared";
import {
  canCurrentUserReviewPyrolysisBatches,
  getPyrolysisBatch,
  submitPyrolysisBatchStatus,
} from "./actions";
import PyrolysisBatchDetailView from "./PyrolysisBatchDetailView";
import ProductionReviewDecisionBar from "./ProductionReviewDecisionBar";
import StatusBadge from "./StatusBadge";
import {
  flagMap,
  formatBatchLabel,
  formatReviewStatus,
  reviewStatusTone,
  type PyrolysisBatchDetail,
} from "./productionLib";

function allPhotoKeys() {
  return PYROLYSIS_BATCH_STATUS_SECTION_KEYS.flatMap((section) =>
    photosForBatchStatusSection(section),
  );
}

export default function PyrolysisBatchReviewPanel({
  batchId,
  onClose,
  onSubmitted,
  embedded = false,
  fullPage = false,
}: {
  batchId: string;
  onClose?: () => void;
  onSubmitted?: (batch: PyrolysisBatchDetail) => void;
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const [data, setData] = useState<PyrolysisBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [batchStatus, setBatchStatus] =
    useState<SubmitPyrolysisBatchStatusPayload["status"]>("accepted");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [photoFlags, setPhotoFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [batch, reviewAllowed] = await Promise.all([
          getPyrolysisBatch(batchId),
          canCurrentUserReviewPyrolysisBatches(),
        ]);

        if (cancelled) return;

        setData(batch);
        setCanReview(reviewAllowed);

        const existing = flagMap(batch.batch_status?.flags);
        const nextPhotos: Record<string, boolean> = {};

        for (const photoKey of allPhotoKeys()) {
          const flag = existing.get(`photo:${photoKey}`);
          nextPhotos[photoKey] = flag != null && flag.status !== "accepted";
        }

        setPhotoFlags(nextPhotos);
        setReviewerNotes(batch.batch_status?.reviewer_notes ?? "");

        if (batch.batch_status?.status && batch.batch_status.status !== "pending") {
          setBatchStatus(batch.batch_status.status);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load batch");
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
  }, [batchId]);

  const payloadFlags = useMemo(() => {
    const flags: PyrolysisBatchStatusFlag[] = [];

    for (const [photoKey, flagged] of Object.entries(photoFlags)) {
      if (!flagged) continue;
      flags.push({
        target_type: "photo",
        target_key: photoKey,
        status: "on_hold",
        notes: null,
      });
    }

    return flags;
  }, [photoFlags]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const updated = await submitPyrolysisBatchStatus(batchId, {
        status: batchStatus,
        reviewer_notes: reviewerNotes.trim() || null,
        flags: payloadFlags,
      });
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
        Loading batch...
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

  const currentStatus = data.batch_status?.status ?? "pending";

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
                {formatBatchLabel(data)}
              </h2>
              <StatusBadge
                label={formatReviewStatus(currentStatus)}
                tone={reviewStatusTone(currentStatus)}
              />
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {data.kontikki_code} · {data.operator_name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!fullPage ? (
              <Link
                href={`/biochar/production/${batchId}`}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-dark hover:bg-neutral-100"
              >
                Open
              </Link>
            ) : (
              <Link
                href="/biochar/production"
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
          <ProductionReviewDecisionBar
            decision={batchStatus}
            reviewerNotes={reviewerNotes}
            submitting={submitting}
            onDecisionChange={setBatchStatus}
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
        <PyrolysisBatchDetailView
          data={data}
          canReview={canReview}
          photoLayout={embedded && !fullPage ? "drawer" : "page"}
          showMixingSection={fullPage}
          photoFlags={photoFlags}
          onPhotoFlagChange={(photoKey, flagged) =>
            setPhotoFlags((current) => ({ ...current, [photoKey]: flagged }))
          }
        />
      </div>
    </div>
  );
}
