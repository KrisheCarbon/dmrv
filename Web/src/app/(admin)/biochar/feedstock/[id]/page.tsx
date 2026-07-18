"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import SignedStorageLink from "@/components/SignedStorageLink";
import { FEEDSTOCK_DOCS_BUCKET } from "@/lib/uploadFeedstockAssets";
import { deleteFeedstock, getFeedstock } from "../actions";
import {
  formatDate,
  formatLabStatus,
  formatMethaneStrategy,
  producerLabel,
  resolveFeedstockProducer,
} from "../feedstockLib";
import type { FeedstockDetail } from "@/types";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function DocumentLink({
  path,
  label,
}: {
  path?: string | null;
  label: string;
}) {
  if (!path) return "—";

  return (
    <SignedStorageLink
      bucket={FEEDSTOCK_DOCS_BUCKET}
      path={path}
      className="text-brand-dark hover:underline"
    >
      {label}
    </SignedStorageLink>
  );
}

export default function FeedstockDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<FeedstockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchFeedstock() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const feedstock = await getFeedstock(id);
      setData(feedstock);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedstock");
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchFeedstock();
  }, [id]);

  async function handleDelete() {
    if (!data?.id) return;

    const confirmed = window.confirm(
      "This will permanently remove this feedstock record.\n\nThis action cannot be undone.\n\nContinue?",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteFeedstock(data.id);
      router.push("/biochar/feedstock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete feedstock");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load feedstock: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/biochar/feedstock")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to feedstock
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Feedstock record not found.</p>;
  }

  const producer = resolveFeedstockProducer(data);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/biochar/feedstock")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to feedstock
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {data.biomass_type}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {producerLabel(producer)}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Details</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/biochar/feedstock/${data.id}/edit`}
              className="inline-flex min-h-[38px] min-w-[70px] items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Biomass type">{data.biomass_type}</DetailRow>
          <DetailRow label="Producer">
            {producer?.id ? (
              <Link
                href={`/network/biochar-producers/${producer.id}`}
                className="text-brand-dark hover:underline"
              >
                {producerLabel(producer)}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="Biochar bulk density">
            {data.biochar_bulk_density_kg_m3} kg/m³
          </DetailRow>
          <DetailRow label="Carbon content">
            {data.carbon_content_percent}%
          </DetailRow>
          <DetailRow label="H/C ratio">{data.hc_ratio}</DetailRow>
          <DetailRow label="Lab status">
            <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-800">
              {formatLabStatus(data.lab_status)}
            </span>
          </DetailRow>
          <DetailRow label="Lab submission date">
            {formatDate(data.lab_submission_date)}
          </DetailRow>
          <DetailRow label="Lab analysis date">
            {formatDate(data.lab_analysis_date)}
          </DetailRow>
          <DetailRow label="Biomass preparation instruction">
            {data.biomass_preparation_instruction || "—"}
          </DetailRow>
          <DetailRow label="Methane compensation strategy">
            {formatMethaneStrategy(data.methane_compensation_strategy)}
          </DetailRow>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Documents</h2>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Lab report">
            <DocumentLink
              path={data.lab_report_doc_url ?? data.lab_report_image_url}
              label="View lab report"
            />
          </DetailRow>
          <DetailRow label="GHG avoidance approval">
            <DocumentLink
              path={
                data.ghg_avoidance_approval_doc_url ??
                data.ghg_avoidance_approval_image_url
              }
              label="View GHG avoidance approval"
            />
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
