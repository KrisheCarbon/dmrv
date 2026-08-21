"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  MOISTURE_READING_COUNT,
  PYROLYSIS_BATCH_STATUS_SECTION_KEYS,
  flatRowToKontikkiData,
  photosForBatchStatusSection,
  pyrolysisBatchStatusPhotoLabel,
  pyrolysisBatchStatusSectionLabel,
  pyrolysisWorkflowSectionSubtitle,
} from "@krishecarbon/shared";
import type { PyrolysisBatchStatusPhotoKey } from "@krishecarbon/shared";
import PyrolysisPhotoThumb from "./PyrolysisPhotoThumb";
import PyrolysisBatchMixingSection from "./PyrolysisBatchMixingSection";
import StatusBadge from "./StatusBadge";
import YieldEditField from "./YieldEditField";
import {
  batchPhotoUrl,
  formatDateTime,
  formatFlagStatus,
  formatReviewStatus,
  flagMap,
  flagStatusTone,
  reviewStatusTone,
  type PyrolysisBatchDetail,
} from "./productionLib";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-2.5 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export default function PyrolysisBatchDetailView({
  data,
  canReview = false,
  photoFlags,
  onPhotoFlagChange,
  onYieldUpdated,
  photoLayout = "drawer",
  showMixingSection = false,
}: {
  data: PyrolysisBatchDetail;
  canReview?: boolean;
  photoFlags?: Record<string, boolean>;
  onPhotoFlagChange?: (photoKey: string, flagged: boolean) => void;
  onYieldUpdated?: (batch: PyrolysisBatchDetail) => void;
  photoLayout?: "drawer" | "page";
  showMixingSection?: boolean;
}) {
  const workflow = flatRowToKontikkiData(data);
  const savedFlags = flagMap(data.batch_status?.flags);
  const reviewTone = reviewStatusTone(data.batch_status?.status ?? "pending");

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dl>
          <DetailRow label="Batch">
            {data.batch_number?.trim() ? data.batch_number : "—"}
          </DetailRow>
          <DetailRow label="Kontikki">{data.kontikki_code}</DetailRow>
          <DetailRow label="Producer">
            {data.producer_id ? (
              <Link
                href={`/network/biochar-producers/${data.producer_id}`}
                className="font-medium text-brand-dark hover:underline"
              >
                {data.producer_name}
              </Link>
            ) : (
              data.producer_name
            )}
          </DetailRow>
          <DetailRow label="Operator">{data.operator_name}</DetailRow>
          <DetailRow label="Session">{data.session_status}</DetailRow>
          {!canReview ? (
            <DetailRow label="Status">
              <StatusBadge
                label={formatReviewStatus(data.batch_status?.status ?? "pending")}
                tone={reviewTone}
              />
            </DetailRow>
          ) : null}
          {data.batch_status?.reviewed_at ? (
            <DetailRow label="Reviewed">
              {formatDateTime(data.batch_status.reviewed_at)}
              {data.batch_status.reviewer?.full_name
                ? ` by ${data.batch_status.reviewer.full_name}`
                : ""}
            </DetailRow>
          ) : null}
          <DetailRow label="Yield">
            <YieldEditField
              batchId={data.id}
              yieldPercent={data.yield_percent}
              canEdit
              onSaved={onYieldUpdated}
            />
          </DetailRow>
        </dl>
      </section>

      {PYROLYSIS_BATCH_STATUS_SECTION_KEYS.map((section) => {
        const savedSectionFlag = savedFlags.get(`section:${section}`);
        const photoKeys = photosForBatchStatusSection(section);

        return (
          <section
            key={section}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-950">
                  {pyrolysisBatchStatusSectionLabel(section)}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {pyrolysisWorkflowSectionSubtitle(section)}
                </p>
              </div>
              {!canReview && savedSectionFlag ? (
                <StatusBadge
                  label={formatFlagStatus(savedSectionFlag.status)}
                  tone={flagStatusTone(savedSectionFlag.status)}
                />
              ) : null}
            </div>

            {section === "info" ? (
              <dl className="mt-3">
                <DetailRow label="Feedstock">{workflow.feedstock_name ?? "—"}</DetailRow>
                <DetailRow label="Quantity">
                  {workflow.feedstock_quantity != null
                    ? `${workflow.feedstock_quantity} kg`
                    : "—"}
                </DetailRow>
                <DetailRow label="Farm">{workflow.farm_name ?? "—"}</DetailRow>
                <DetailRow label="Avg. size">
                  {workflow.avg_feedstock_size_cm != null
                    ? `${workflow.avg_feedstock_size_cm} cm`
                    : "—"}
                </DetailRow>
                <DetailRow label="Location">
                  {workflow.location?.address ??
                    (workflow.location
                      ? `${workflow.location.lat}, ${workflow.location.lng}`
                      : "—")}
                </DetailRow>
              </dl>
            ) : null}

            {section === "moisture" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: MOISTURE_READING_COUNT }, (_, index) => {
                  const reading = workflow.moisture_readings?.[index];
                  return (
                    <div
                      key={index}
                      className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-neutral-700">
                        Reading {index + 1}
                      </span>
                      <span className="text-neutral-500">
                        {" "}
                        — {reading?.reading != null ? `${reading.reading}%` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {section === "yield" ? (
              <dl className="mt-3">
                <DetailRow label="Yield %">
                  <YieldEditField
                    batchId={data.id}
                    yieldPercent={workflow.yield_percent}
                    canEdit
                    onSaved={onYieldUpdated}
                  />
                </DetailRow>
                <DetailRow label="Comment">{workflow.comment?.trim() || "—"}</DetailRow>
              </dl>
            ) : null}

            {photoKeys.length > 0 ? (
              <div
                className={`mt-3 grid gap-3 ${
                  photoLayout === "drawer"
                    ? "grid-cols-1"
                    : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                }`}
              >
                {photoKeys.map((photoKey) => {
                  const savedPhotoFlag = savedFlags.get(`photo:${photoKey}`);
                  const label = pyrolysisBatchStatusPhotoLabel(photoKey);
                  const flagged = canReview
                    ? Boolean(photoFlags?.[photoKey])
                    : savedPhotoFlag != null && savedPhotoFlag.status !== "accepted";

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
                      <PyrolysisPhotoThumb
                        size={photoLayout}
                        path={batchPhotoUrl(data, photoKey as PyrolysisBatchStatusPhotoKey)}
                        label={label}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}

      {showMixingSection ? (
        <PyrolysisBatchMixingSection entries={data.mixing_entries ?? []} />
      ) : null}
    </div>
  );
}
