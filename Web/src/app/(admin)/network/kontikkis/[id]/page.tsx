"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { deleteKontikki, getKontikki } from "../actions";
import SignedStorageLink from "@/components/SignedStorageLink";
import { createSignedStorageUrl } from "@/lib/privateStorage";
import {
  fileNameFromKontikkiAssetPath,
  KONTIKKI_ASSETS_BUCKET,
  normalizeKontikkiPhotoPaths,
} from "@/lib/uploadKontikkiAssets";
import { formatKontikkiCapacity, resolveKontikkiCapacity } from "../kontikkiLib";
import type { KontikkiDetail } from "@/types";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function SignedPhotoThumb({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    createSignedStorageUrl(KONTIKKI_ASSETS_BUCKET, path).then((signed) => {
      if (!cancelled) setSrc(signed);
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  const fileName = fileNameFromKontikkiAssetPath(path);

  return (
    <div className="w-28 shrink-0">
      <div className="h-24 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
        {src ? (
          <img src={src} alt={fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-100" />
        )}
      </div>
      <p className="mt-1 truncate text-xs text-neutral-500">{fileName}</p>
    </div>
  );
}

export default function KontikkiViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<KontikkiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchKontikki() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const row = await getKontikki(id);
      setData(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kontikki");
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchKontikki();
  }, [id]);

  async function handleDelete() {
    if (!data?.id) return;

    const confirmed = window.confirm(
      "This will permanently delete this kontikki.\n\nThis action cannot be undone.\n\nContinue?",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteKontikki(data.id);
      router.push("/network/kontikkis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete kontikki");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load kontikki: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/kontikkis")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to kontikkis
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Kontikki not found.</p>;
  }

  const producer = Array.isArray(data.biochar_producer)
    ? data.biochar_producer[0]
    : data.biochar_producer;

  const operators =
    data.kontikki_operators?.map((assignment) => {
      const user = Array.isArray(assignment.users)
        ? assignment.users[0]
        : assignment.users;
      return user?.full_name?.trim() || "Unnamed operator";
    }) ?? [];

  const topPhotos = normalizeKontikkiPhotoPaths(
    data.top_photo_urls,
    data.top_photo_url,
  );
  const bottomPhotos = normalizeKontikkiPhotoPaths(
    data.bottom_photo_urls,
    data.side_photo_url,
  );

  const capacity = resolveKontikkiCapacity(data);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/kontikkis")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to kontikkis
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Pyrolysis Unit (Kon-Tiki) / {data.kontikki_code}
        </h1>
        {data.kp_number ? (
          <p className="mt-1 text-sm text-neutral-500">KP-Number: {data.kp_number}</p>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">KP-Number: Not assigned</p>
        )}
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
              href={`/network/kontikkis/${data.id}/edit`}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 min-w-[70px] min-h-[38px]"
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
          <DetailRow label="Name">{data.kontikki_code}</DetailRow>

          <DetailRow label="Hardware module ID">
            {data.module_id?.trim() ? (
              <code className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
                {data.module_id}
              </code>
            ) : (
              <span className="text-neutral-400">Not configured</span>
            )}
          </DetailRow>

          <DetailRow label="Producer">
            {producer?.id || data.biochar_producer_id ? (
              <Link
                href={`/network/biochar-producers/${producer?.id ?? data.biochar_producer_id}`}
                className="font-medium text-brand-dark hover:underline"
              >
                {producer?.name ?? "View producer"}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Status">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                data.status === "inactive"
                  ? "bg-neutral-100 text-neutral-600"
                  : "bg-brand-green/10 text-brand-dark"
              }`}
            >
              {data.status ?? "active"}
            </span>
          </DetailRow>

          <DetailRow label="Top diameter">
            {data.top_diameter_cm ? `${Number(data.top_diameter_cm).toFixed(2)} cm` : "—"}
          </DetailRow>

          <DetailRow label="Bottom diameter">
            {data.bottom_diameter_cm
              ? `${Number(data.bottom_diameter_cm).toFixed(2)} cm`
              : "—"}
          </DetailRow>

          <DetailRow label="Depth">
            {data.depth_cm ? `${Number(data.depth_cm).toFixed(2)} cm` : "—"}
          </DetailRow>

          <DetailRow label="Capacity">{formatKontikkiCapacity(capacity)}</DetailRow>

          <DetailRow label="Operators">
            {operators.length ? (
              <ul className="space-y-2">
                {operators.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <span className="text-neutral-400" aria-hidden>
                      &#9679;
                    </span>
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Design document">
            {data.plan_pdf_url ? (
              <SignedStorageLink
                bucket={KONTIKKI_ASSETS_BUCKET}
                path={data.plan_pdf_url}
                className="text-brand-dark hover:underline"
              >
                View design document
              </SignedStorageLink>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Top view picture">
            {topPhotos.length ? (
              <div className="flex flex-wrap gap-4">
                {topPhotos.map((path) => (
                  <SignedPhotoThumb key={path} path={path} />
                ))}
              </div>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Bottom view picture">
            {bottomPhotos.length ? (
              <div className="flex flex-wrap gap-4">
                {bottomPhotos.map((path) => (
                  <SignedPhotoThumb key={path} path={path} />
                ))}
              </div>
            ) : (
              "—"
            )}
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
