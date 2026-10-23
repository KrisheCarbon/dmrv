"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BIOMASS_COLLECTION_TRACTOR_NOTICE,
  type BiomassCollectionRecord,
  type FieldPhotoMetadata,
} from "@krishecarbon/shared";
import ApplicationMediaThumb from "../application/ApplicationMediaThumb";
import { getBiomassCollection } from "./actions";
import { farmDistanceSummary, formatDateTime, mapsUrl, transitDuration } from "./biomassCollectionLib";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-2.5 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function PhotoMetadata({
  metadata,
  distanceDetail,
  distanceOutside,
}: {
  metadata?: FieldPhotoMetadata | null;
  distanceDetail?: string | null;
  distanceOutside?: boolean;
}) {
  if (!metadata) {
    return <p className="text-sm text-neutral-500">No metadata on this photo.</p>;
  }

  return (
    <dl>
      <DetailRow label="Captured (IST)">{formatDateTime(metadata.captured_at)}</DetailRow>
      <DetailRow label="GPS">
        <a
          href={mapsUrl(metadata)}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-dark hover:underline"
        >
          {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}
        </a>
        {metadata.accuracy_m != null ? ` · ±${Math.round(metadata.accuracy_m)} m` : ""}
      </DetailRow>
      <DetailRow label="Address">{metadata.address?.trim() || "—"}</DetailRow>
      {distanceDetail ? (
        <DetailRow label="From farm">
          <span className={distanceOutside ? "font-medium text-status-error" : undefined}>
            {distanceDetail}
          </span>
        </DetailRow>
      ) : null}
      <DetailRow label="Device time">{formatDateTime(metadata.device_time_iso)}</DetailRow>
    </dl>
  );
}

function PhotoSection({
  title,
  url,
  metadata,
  distanceDetail,
  distanceOutside,
  layout,
}: {
  title: string;
  url: string;
  metadata?: FieldPhotoMetadata | null;
  distanceDetail?: string | null;
  distanceOutside?: boolean;
  layout: "drawer" | "page";
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <h3 className="border-b border-neutral-100 pb-3 text-sm font-semibold text-neutral-950">
        {title}
      </h3>
      <p className="mt-3 rounded-xl bg-[var(--status-warning-bg)] px-3 py-2 text-xs font-medium text-status-warning">
        {BIOMASS_COLLECTION_TRACTOR_NOTICE}
      </p>
      <div className={layout === "page" ? "mt-3 grid gap-4 md:grid-cols-2" : "mt-3 space-y-3"}>
        <ApplicationMediaThumb url={url} mediaType="photo" label={title} size={layout} />
        <PhotoMetadata
          metadata={metadata}
          distanceDetail={distanceDetail}
          distanceOutside={distanceOutside}
        />
      </div>
    </section>
  );
}

export default function BiomassCollectionPanel({
  collectionId,
  onClose,
  embedded = false,
  fullPage = false,
}: {
  collectionId: string;
  onClose?: () => void;
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const [data, setData] = useState<BiomassCollectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBiomassCollection(collectionId)
      .then((record) => {
        if (!cancelled) setData(record);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load biomass collection");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
        Loading biomass collection...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-red-600">{error ?? "Biomass collection not found."}</p>
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

  const layout = embedded && !fullPage ? "drawer" : "page";
  const duration = transitDuration(data);
  const distance = farmDistanceSummary(data);

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "space-y-4"}>
      <div className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2
              className={
                embedded
                  ? "truncate text-base font-semibold text-neutral-950"
                  : "text-2xl font-semibold tracking-tight text-neutral-950"
              }
            >
              {data.farm_name ?? "Farm not set"} → {data.producer_name ?? "Site not set"}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {formatDateTime(data.loaded_at)} · {data.operator_name ?? "Unknown"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={fullPage ? "/biochar/biomass-collection" : `/biochar/biomass-collection/${data.id}`}
              className="rounded-xl px-2 py-1.5 text-xs font-medium text-brand-dark hover:bg-neutral-100"
            >
              {fullPage ? "List" : "Open"}
            </Link>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
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
      </div>

      <div
        className={
          embedded ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" : "space-y-3 px-0"
        }
      >
        <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <dl>
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
            <DetailRow label="Production site">{data.producer_name ?? "—"}</DetailRow>
            <DetailRow label="Tractor number">{data.tractor_number?.trim() || "—"}</DetailRow>
            <DetailRow label="From farm">
              <span className={distance.outsideLimit ? "font-medium text-status-error" : undefined}>
                {distance.detail}
              </span>
            </DetailRow>
            <DetailRow label="Operator">{data.operator_name ?? "—"}</DetailRow>
            <DetailRow label="Loaded">{formatDateTime(data.loaded_at)}</DetailRow>
            <DetailRow label="Unloaded">{formatDateTime(data.unloaded_at)}</DetailRow>
            <DetailRow label="Transit time">{duration ?? "—"}</DetailRow>
          </dl>
        </section>

        <PhotoSection
          title="Loaded at the farm"
          url={data.loaded_photo_url}
          metadata={data.loaded_photo_metadata}
          distanceDetail={distance.detail}
          distanceOutside={distance.outsideLimit}
          layout={layout}
        />
        <PhotoSection
          title="Unloaded at the production site"
          url={data.unloaded_photo_url}
          metadata={data.unloaded_photo_metadata}
          layout={layout}
        />
      </div>
    </div>
  );
}
