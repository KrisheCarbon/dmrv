"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  MIXING_ENTRY_PHOTO_KEYS,
  mixingEntryPhotoLabel,
  type MixingEntryPhotoKey,
} from "@krishecarbon/shared";
import StatusBadge from "../production/StatusBadge";
import MixingPhotoThumb from "./MixingPhotoThumb";
import {
  formatDateTime,
  formatLinkedBatchLabel,
  formatLocation,
  formatMaterial,
  formatRatio,
  formatReviewStatus,
  photoFlagMap,
  resolveReviewStatus,
  reviewStatusTone,
  type MixingEntryDetail,
} from "./mixingLib";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-2.5 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export default function MixingEntryDetailView({
  data,
  canReview = false,
  photoFlags,
  onPhotoFlagChange,
  photoLayout = "drawer",
}: {
  data: MixingEntryDetail;
  canReview?: boolean;
  photoFlags?: Record<string, boolean>;
  onPhotoFlagChange?: (photoKey: MixingEntryPhotoKey, flagged: boolean) => void;
  photoLayout?: "drawer" | "page";
}) {
  const savedFlags = photoFlagMap(data);
  const reviewStatus = resolveReviewStatus(data);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dl>
          <DetailRow label="Time">{formatDateTime(data.started_at)}</DetailRow>
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
          <DetailRow label="Location">{formatLocation(data)}</DetailRow>
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
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
          Mixing inputs
        </h3>
        <dl className="mt-3">
          <DetailRow label="Material">{formatMaterial(data)}</DetailRow>
          <DetailRow label="Material : biochar ratio">
            {formatRatio(data.material_to_biochar_ratio)}
          </DetailRow>
          <DetailRow label="Comment">{data.comment?.trim() || "—"}</DetailRow>
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
          Linked pyrolysis batches
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
        <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
          Photos
        </h3>
        <div
          className={`mt-3 grid gap-3 ${
            photoLayout === "drawer" ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {MIXING_ENTRY_PHOTO_KEYS.map((photoKey) => {
            const url =
              photoKey === "biochar"
                ? data.biochar_photo_url
                : photoKey === "substrate"
                  ? data.substrate_photo_url
                  : data.mixing_photo_url;
            const label = mixingEntryPhotoLabel(photoKey);
            const flagged = canReview
              ? Boolean(photoFlags?.[photoKey])
              : savedFlags.has(photoKey);

            return (
              <div
                key={photoKey}
                className="rounded-lg border border-neutral-100 bg-neutral-50 p-2"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-medium text-neutral-600">
                    {label}
                  </p>
                  {canReview ? (
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-600">
                      <input
                        type="checkbox"
                        checked={Boolean(photoFlags?.[photoKey])}
                        onChange={(event) =>
                          onPhotoFlagChange?.(photoKey, event.target.checked)
                        }
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
                <MixingPhotoThumb size={photoLayout} url={url} label={label} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
