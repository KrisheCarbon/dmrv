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
import { useIsDmrvViewer } from "@/components/DmrvViewerGate";
import PyrolysisBatchMixingSection from "./PyrolysisBatchMixingSection";
import StatusBadge from "./StatusBadge";
import VolumePercentField from "./VolumePercentField";
import YieldEditField from "./YieldEditField";
import RainbowRunProofView from "./RainbowRunProofView";
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

const CSI_ONLY_SECTIONS = new Set(["moisture", "initial", "middle", "final", "quenching"]);

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
  const readOnly = useIsDmrvViewer();
  const savedFlags = flagMap(data.batch_status?.flags);
  const reviewTone = reviewStatusTone(data.batch_status?.status ?? "pending");

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dl>
          <DetailRow label="Field batch">
            {data.batch_number?.trim() ? data.batch_number : "—"}
          </DetailRow>
          <DetailRow label="Generated batch">
            {data.generated_batch_code?.trim() ? data.generated_batch_code : "—"}
          </DetailRow>
          <DetailRow label="Record id">{data.id}</DetailRow>
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
              canEdit={data.protocol !== "rainbow" && !readOnly}
              onSaved={onYieldUpdated}
            />
          </DetailRow>
          {data.protocol === "rainbow" ? (
            <DetailRow label="Biochar">
              {data.estimated_biochar_mass_kg != null
                ? `${data.estimated_biochar_mass_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg estimated`
                : data.estimated_biochar_volume_liters != null
                  ? `${data.estimated_biochar_volume_liters.toLocaleString(undefined, { maximumFractionDigits: 2 })} L estimated`
                  : "Set a volume percent in Yield"}
            </DetailRow>
          ) : null}
        </dl>
      </section>

      {PYROLYSIS_BATCH_STATUS_SECTION_KEYS.map((section) => {
        if (data.protocol === "rainbow" && CSI_ONLY_SECTIONS.has(section)) return null;
        const savedSectionFlag = savedFlags.get(`section:${section}`);
        const photoKeys = photosForBatchStatusSection(section);

        return (
          <div key={section} className="space-y-3">
          <section
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
              <div className="mt-3">
                {data.protocol === "rainbow" || data.kiln_photo_url ? (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-neutral-900">Kiln photo</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Permanent mark and the cone, taken before this run.
                    </p>
                    {data.kiln_photo_url ? (
                      <div className="mt-2 max-w-sm">
                        <PyrolysisPhotoThumb
                          size={photoLayout}
                          path={data.kiln_photo_url}
                          label="Kiln photo"
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-neutral-900">Not uploaded.</p>
                    )}
                  </div>
                ) : null}
              <dl>
                <DetailRow label="Feedstock">{workflow.feedstock_name ?? "—"}</DetailRow>
                {data.protocol === "rainbow" ? (
                  <DetailRow label="Class">
                    {data.run_proof?.feedstock_class === "woody"
                      ? "Woody"
                      : data.run_proof?.feedstock_class === "other"
                        ? "Other"
                        : "—"}
                  </DetailRow>
                ) : null}
                <DetailRow label="Quantity">
                  {workflow.feedstock_quantity != null
                    ? `${workflow.feedstock_quantity} kg`
                    : "—"}
                </DetailRow>
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
              </div>
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
                    canEdit={data.protocol !== "rainbow" && !readOnly}
                    onSaved={onYieldUpdated}
                  />
                </DetailRow>
                {data.protocol === "rainbow" ? (
                  <DetailRow label="Volume %">
                    <VolumePercentField batch={data} readOnly={readOnly} onSaved={onYieldUpdated} />
                  </DetailRow>
                ) : null}
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
          {data.protocol === "rainbow" && section === "info" ? (
            <RainbowRunProofView proof={data.run_proof ?? null} photoLayout={photoLayout} />
          ) : null}
          </div>
        );
      })}

      {showMixingSection ? (
        <PyrolysisBatchMixingSection entries={data.mixing_entries ?? []} />
      ) : null}
    </div>
  );
}
