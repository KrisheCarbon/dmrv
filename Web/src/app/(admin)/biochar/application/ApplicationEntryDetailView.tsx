"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { APPLICATION_ENTRY_MEDIA_KEYS } from "@krishecarbon/shared";
import StatusBadge from "../production/StatusBadge";
import ApplicationMediaThumb from "./ApplicationMediaThumb";
import {
  formatDateTime,
  formatLinkedBatchLabel,
  formatMediaType,
  formatReviewStatus,
  mediaFlagMap,
  resolveReviewStatus,
  reviewStatusTone,
  type ApplicationEntryDetail,
} from "./applicationLib";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-2.5 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export default function ApplicationEntryDetailView({
  data,
  canReview = false,
  mediaFlagged,
  onMediaFlagChange,
  mediaLayout = "drawer",
}: {
  data: ApplicationEntryDetail;
  canReview?: boolean;
  mediaFlagged?: boolean;
  onMediaFlagChange?: (flagged: boolean) => void;
  mediaLayout?: "drawer" | "page";
}) {
  const savedFlags = mediaFlagMap(data);
  const reviewStatus = resolveReviewStatus(data);
  const mediaKey = APPLICATION_ENTRY_MEDIA_KEYS[0];
  const flagged = canReview ? Boolean(mediaFlagged) : savedFlags.has(mediaKey);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dl>
          <DetailRow label="Time">{formatDateTime(data.applied_at)}</DetailRow>
          <DetailRow label="Operator">{data.operator_name}</DetailRow>
          <DetailRow label="Farm">
            {data.farm_id && data.farm_name ? (
              <Link
                href={`/network/farms/${data.farm_id}`}
                className="font-medium text-brand-dark hover:underline"
              >
                {data.farm_name}
              </Link>
            ) : (
              data.farm_name ?? "—"
            )}
          </DetailRow>
          <DetailRow label="Media">{formatMediaType(data)}</DetailRow>
          {!canReview ? (
            <DetailRow label="Status">
              <StatusBadge
                label={formatReviewStatus(reviewStatus)}
                tone={reviewStatusTone(reviewStatus)}
              />
            </DetailRow>
          ) : null}
          {data.entry_status?.reviewed_at ? (
            <DetailRow label="Reviewed">
              {formatDateTime(data.entry_status.reviewed_at)}
              {data.entry_status.reviewer?.full_name
                ? ` by ${data.entry_status.reviewer.full_name}`
                : ""}
            </DetailRow>
          ) : null}
          <DetailRow label="Comment">{data.comment?.trim() || "—"}</DetailRow>
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
          Biochar batches
        </h3>
        {data.pyrolysis_links.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No batches linked.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-100">
            {data.pyrolysis_links.map((link) => (
              <div key={link.pyrolysis_batch_id} className="py-2.5">
                <Link
                  href={`/biochar/production/${link.pyrolysis_batch_id}`}
                  className="font-medium text-brand-dark hover:underline"
                >
                  {formatLinkedBatchLabel(link)}
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {[link.kontikki_code, link.producer_name].filter(Boolean).join(" · ") ||
                    "Production batch"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-semibold text-neutral-950">Application media</h3>
          {canReview ? (
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-600">
              <input
                type="checkbox"
                checked={Boolean(mediaFlagged)}
                onChange={(event) => onMediaFlagChange?.(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300 text-brand-dark focus:ring-brand-dark"
              />
              Flag
            </label>
          ) : flagged ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Flagged
            </span>
          ) : null}
        </div>
        <ApplicationMediaThumb
          url={data.media_url}
          mediaType={data.media_type}
          size={mediaLayout}
        />
      </section>
    </div>
  );
}
