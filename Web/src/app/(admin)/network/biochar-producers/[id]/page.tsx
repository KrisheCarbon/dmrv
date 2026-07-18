"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import SignedStorageLink from "@/components/SignedStorageLink";
import DataTable from "@/components/table/DataTable";
import { BIOCHAR_PRODUCER_DOCS_BUCKET } from "@/lib/privateStorage";
import { deleteProducer, getProducer } from "../actions";
import {
  affiliationFromProducer,
  formatProducerClass,
  formatSiteModel,
  normalizeOtherDocumentPaths,
  resolveAffiliationLabel,
  resolveKontikkiOperators,
  resolveSiteAffiliation,
} from "../producerLib";
import type { BiocharProducerDetail } from "@/types";

interface KontikkiRow extends Record<string, unknown> {
  id: string;
  code: string;
  status: string;
  operators: string;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export default function BiocharProducerViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<BiocharProducerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const producer = await getProducer(id);
      setData(producer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load producer");
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, [id]);

  async function handleDelete() {
    if (!data?.id) return;

    const confirmed = window.confirm(
      "This will permanently delete this producer.\n\nThis action cannot be undone.\n\nContinue?",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteProducer(data.id);
      router.push("/network/biochar-producers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete producer");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load producer: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/biochar-producers")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to producers
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Producer not found.</p>;
  }

  const producerLocation = data.producer_location;
  const sites = data.producer_sites ?? [];
  const kontikkis = data.kontikkis ?? [];
  const otherDocuments = normalizeOtherDocumentPaths(data);

  const supervisors =
    data.biochar_producer_supervisors?.map((assignment) => {
      const user = Array.isArray(assignment.users)
        ? assignment.users[0]
        : assignment.users;
      return user?.full_name?.trim() || "Unnamed supervisor";
    }) ?? [];

  const kontikkiRows: KontikkiRow[] = kontikkis.map((kontikki) => ({
    id: kontikki.id,
    code: kontikki.kontikki_code ?? "—",
    status:
      kontikki.status === "inactive"
        ? "Inactive"
        : kontikki.status === "active"
          ? "Active"
          : "—",
    operators: resolveKontikkiOperators(kontikki.kontikki_operators),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/biochar-producers")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to producers
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {data.name}
        </h1>
        {data.producer_code ? (
          <p className="mt-1 text-sm text-neutral-500">
            Producer ID: {data.producer_code}
            {data.registry_producer_id
              ? ` · Registry: ${data.registry_producer_id}`
              : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">Producer ID: Not assigned</p>
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
              href={`/network/biochar-producers/${data.id}/edit`}
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
          <DetailRow label="Name">{data.name}</DetailRow>

          <DetailRow label="Registry producer ID">
            {data.registry_producer_id ? (
              <span className="font-mono">{data.registry_producer_id}</span>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Class">
            {formatProducerClass(data.producer_class)}
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

          <DetailRow label="Contact name">{data.contact_name ?? "—"}</DetailRow>

          <DetailRow label="Email">{data.email ?? "—"}</DetailRow>

          <DetailRow label="Mobile number">{data.mobile_number ?? "—"}</DetailRow>

          <DetailRow label="Affiliation">
            {resolveAffiliationLabel({
              ...affiliationFromProducer(data),
              partner_organizations: data.partner_organizations,
            })}
          </DetailRow>

          <DetailRow label="Operating model">
            {data.operation_model ? formatSiteModel(data.operation_model) : "—"}
          </DetailRow>

          <DetailRow label="Producer location">
            {producerLocation?.place_name ??
              (producerLocation
                ? `${producerLocation.lat}, ${producerLocation.lng}`
                : "—")}
          </DetailRow>

          <DetailRow label="Supervisors">
            {supervisors.length ? (
              <ul className="space-y-2">
                {supervisors.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center gap-2">
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
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Project sites</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Fixed project sites for this producer.
            </p>
          </div>
          <Link
            href={`/network/biochar-producers/${data.id}/edit`}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Add site
          </Link>
        </div>

        <div className="px-6 py-4">
          {sites.length === 0 ? (
            <p className="text-sm text-neutral-500">No project sites yet.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {sites.map((site) => {
                const location = site.site_location;

                return (
                  <dl key={site.id} className="py-2 first:pt-0 last:pb-0">
                    <DetailRow label="Site name">
                      {site.site_name?.trim() || "Unnamed site"}
                    </DetailRow>
                    <DetailRow label="Affiliation">
                      {resolveSiteAffiliation(site)}
                    </DetailRow>
                    <DetailRow label="Site location">
                      {location?.place_name ??
                        (location
                          ? `${location.lat}, ${location.lng}`
                          : "—")}
                    </DetailRow>
                    <DetailRow label="Site manager">
                      {site.site_manager_name ?? "—"}
                    </DetailRow>
                    <DetailRow label="Manager contact">
                      {[site.site_manager_email, site.site_manager_mobile]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </DetailRow>
                  </dl>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Kontikkis</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Pyrolysis units assigned to this producer.
            </p>
          </div>
          <Link
            href={`/network/kontikkis/new?producerId=${data.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-brand-dark px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
          >
            + Add kontikki
          </Link>
        </div>

        <div className="px-6 py-4">
          <DataTable
            emptyText="No kontikkis assigned to this producer yet."
            columns={[
              { key: "code", label: "Kontikki ID" },
              { key: "status", label: "Status" },
              { key: "operators", label: "Operators" },
            ]}
            rows={kontikkiRows}
            actions={(row) => (
              <button
                type="button"
                onClick={() => router.push(`/network/kontikkis/${row.id}`)}
                className="text-sm font-medium text-brand-dark hover:underline"
              >
                Open
              </button>
            )}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Documents</h2>
        </div>

        <dl className="px-6 py-2">
          <DetailRow label="Contract">
            {data.contract_url ? (
              <SignedStorageLink
                bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
                path={data.contract_url}
                className="text-brand-dark hover:underline"
              >
                View contract
              </SignedStorageLink>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Training certification">
            {data.training_cert_url ? (
              <SignedStorageLink
                bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
                path={data.training_cert_url}
                className="text-brand-dark hover:underline"
              >
                View training certification
              </SignedStorageLink>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="Other documents">
            {otherDocuments.length > 0 ? (
              <ul className="space-y-2">
                {otherDocuments.map((path, index) => (
                  <li key={path}>
                    <SignedStorageLink
                      bucket={BIOCHAR_PRODUCER_DOCS_BUCKET}
                      path={path}
                      className="text-brand-dark hover:underline"
                    >
                      Document {index + 1}
                    </SignedStorageLink>
                  </li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
