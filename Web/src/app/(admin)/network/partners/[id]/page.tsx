"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import SignedStorageLink from "@/components/SignedStorageLink";
import { PARTNER_DOCS_BUCKET } from "@/lib/uploadPartnerDocs";
import { deletePartner, getPartner } from "../actions";
import type { PartnerOrg } from "@/types";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function TagList({ items }: { items?: string[] }) {
  if (!items?.length) return "—";

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-800"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function PartnerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<PartnerOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchPartner() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const partner = await getPartner(id);
      setData(partner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partner");
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchPartner();
  }, [id]);

  async function handleDelete() {
    if (!data?.id) return;

    const confirmed = window.confirm(
      "This will permanently remove this partner organisation.\n\nThis action cannot be undone.\n\nContinue?",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deletePartner(data.id);
      router.push("/network/partners");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete partner");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load partner: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/partners")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to partners
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Partner not found.</p>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/partners")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to partners
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {data.org_name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {data.base_location || "No base location recorded"}
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
              href={`/network/partners/${data.id}/edit`}
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
          <DetailRow label="Organisation name">{data.org_name}</DetailRow>
          <DetailRow label="CIN number">{data.cin_number || "—"}</DetailRow>
          <DetailRow label="Base location">{data.base_location || "—"}</DetailRow>
          <DetailRow label="Farmer base">{data.farmer_base ?? "—"}</DetailRow>
          <DetailRow label="Status">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                data.status === "inactive"
                  ? "bg-neutral-100 text-neutral-600"
                  : "bg-brand-green/10 text-brand-dark"
              }`}
            >
              {data.status ?? "inactive"}
            </span>
          </DetailRow>
          <DetailRow label="States of operation">
            <TagList items={data.states_of_operation} />
          </DetailRow>
          <DetailRow label="Crop types">
            <TagList items={data.crop_types} />
          </DetailRow>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Bank details</h2>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Account holder name">
            {data.bank_account_holders_name || "—"}
          </DetailRow>
          <DetailRow label="Account number">
            {data.bank_account_number || "—"}
          </DetailRow>
          <DetailRow label="IFSC code">{data.bank_ifsc || "—"}</DetailRow>
          <DetailRow label="Bank name">{data.bank_name || "—"}</DetailRow>
          <DetailRow label="Branch">{data.bank_branch || "—"}</DetailRow>
          <DetailRow label="Bank address">{data.bank_address || "—"}</DetailRow>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Documents</h2>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="PAN card">
            {data.pan_card_url ? (
              <SignedStorageLink
                bucket={PARTNER_DOCS_BUCKET}
                path={data.pan_card_url}
                className="text-brand-dark hover:underline"
              >
                View PAN card
              </SignedStorageLink>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label="MoU document">
            {data.mou_url ? (
              <SignedStorageLink
                bucket={PARTNER_DOCS_BUCKET}
                path={data.mou_url}
                className="text-brand-dark hover:underline"
              >
                View MoU document
              </SignedStorageLink>
            ) : (
              "—"
            )}
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
