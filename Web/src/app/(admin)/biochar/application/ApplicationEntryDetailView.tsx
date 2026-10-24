"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  APPLICATION_ENTRY_MEDIA_KEYS,
  APPLICATION_PHOTO_NEAR_APPLIED_M,
  formatApplicationAcres,
} from "@krishecarbon/shared";
import FarmLocationMap, { googleMapsUrl } from "@/components/maps/FarmLocationMap";
import StatusBadge from "../production/StatusBadge";
import ApplicationMediaThumb from "./ApplicationMediaThumb";
import {
  formatDateTime,
  formatLinkedBatchLabel,
  formatMediaType,
  formatReviewStatus,
  mediaFlagMap,
  applicationPlaceSummary,
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
  const photoPlace = applicationPlaceSummary(data);
  const photoLat = data.media_metadata?.latitude ?? data.location_lat;
  const photoLng = data.media_metadata?.longitude ?? data.location_lng;
  const photoOutside =
    data.photo_inside_farm === false ||
    (data.photo_distance_from_applied_m != null &&
      data.photo_distance_from_applied_m > APPLICATION_PHOTO_NEAR_APPLIED_M);
  const hasMap =
    (data.application_boundary?.length ?? 0) >= 3 ||
    (Number.isFinite(Number(photoLat)) && Number.isFinite(Number(photoLng)));

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <dl>
          <DetailRow label="Time">{formatDateTime(data.applied_at)}</DetailRow>
          <DetailRow label="Operator">{data.operator_name}</DetailRow>
          <DetailRow label="Farm">
            {data.farm_id && data.farm_name ? (
              <Link
                href={`/network/farmers/${data.farm_id}`}
                className="font-medium text-brand-dark hover:underline"
              >
                {data.farm_name}
              </Link>
            ) : (
              data.farm_name ?? "—"
            )}
          </DetailRow>
          <DetailRow label="Farm plot">{data.field_code ?? "—"}</DetailRow>
          <DetailRow label="Farm area">{formatApplicationAcres(data.farm_area_acres)}</DetailRow>
          <DetailRow label="Applied area">
            {formatApplicationAcres(data.application_area_acres)}
          </DetailRow>
          <DetailRow label="Photo place">
            <span className={photoOutside ? "font-medium text-status-error" : undefined}>
              {photoPlace.detail}
            </span>
          </DetailRow>
          <DetailRow label="Photo GPS">
            {photoLat != null && photoLng != null && Number.isFinite(photoLat) && Number.isFinite(photoLng) ? (
              <a
                href={googleMapsUrl(photoLat, photoLng)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-dark hover:underline"
              >
                {photoLat.toFixed(6)}, {photoLng.toFixed(6)}
              </a>
            ) : (
              "—"
            )}
            {data.media_metadata?.accuracy_m != null
              ? ` · ±${Math.round(data.media_metadata.accuracy_m)} m`
              : ""}
          </DetailRow>
          <DetailRow label="Photo address">
            {data.media_metadata?.address?.trim() || data.location_address?.trim() || "—"}
          </DetailRow>
          <DetailRow label="Captured">
            {formatDateTime(data.media_metadata?.captured_at ?? data.applied_at)}
          </DetailRow>
          <DetailRow label="Device time">
            {formatDateTime(data.media_metadata?.device_time_iso)}
          </DetailRow>
          <DetailRow label="Recorded location">
            {data.location_lat != null && data.location_lng != null ? (
              <a
                href={googleMapsUrl(data.location_lat, data.location_lng)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-dark hover:underline"
              >
                {data.location_lat.toFixed(6)}, {data.location_lng.toFixed(6)}
              </a>
            ) : (
              "—"
            )}
            {data.location_address?.trim() ? ` · ${data.location_address.trim()}` : ""}
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
          <DetailRow label="Reviewer notes">
            {data.entry_status?.reviewer_notes?.trim() || "—"}
          </DetailRow>
        </dl>
      </section>

      {hasMap ? (
        <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
            Where it was applied
          </h3>
          <p className="mt-3 text-sm text-text-secondary">
            The outline is the area where biochar was applied. The pin is the photo GPS.
            Farm area is the whole mapped plot; applied area is this outline.
          </p>
          <div className="mt-3">
            <FarmLocationMap
              points={data.application_boundary ?? []}
              latitude={photoLat}
              longitude={photoLng}
              className="h-56"
            />
          </div>
        </section>
      ) : null}

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
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={Boolean(mediaFlagged)}
                onChange={(event) => onMediaFlagChange?.(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300 text-brand-dark focus:ring-brand-dark"
              />
              Flag
            </label>
          ) : flagged ? (
            <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning">
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
