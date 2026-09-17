"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { deleteCluster, getCluster } from "../actions";
import type { ClusterDetail, ClusterPerson } from "@/types";
import { unwrapQuery } from "@/lib/queryResult";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-100 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-8">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function PeopleList({ people }: { people: ClusterPerson[] }) {
  if (people.length === 0) return "—";
  return (
    <div className="space-y-1">
      {people.map((person) => (
        <p key={person.id}>
          {person.full_name}
          {person.phone ? ` · ${person.phone}` : ""}
        </p>
      ))}
    </div>
  );
}

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCluster = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setData(unwrapQuery(await getCluster(id), "Failed to load cluster"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cluster");
      setData(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadCluster();
  }, [loadCluster]);

  async function handleDelete() {
    if (!data?.id) return;
    const confirmed = window.confirm(
      "This will permanently delete this cluster, its villages, and staff assignments.\n\nContinue?",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteCluster(data.id);
      router.push("/network/clusters");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cluster");
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading...</p>;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load cluster: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/clusters")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to clusters
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Cluster not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/network/clusters")}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to clusters
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          {data.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {data.villages.length} village{data.villages.length === 1 ? "" : "s"}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">Cluster</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/network/clusters/${data.id}/edit`}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
        <dl className="px-6 py-2">
          <DetailRow label="Cluster name">{data.name}</DetailRow>
          <DetailRow label="Villages">
            {data.villages.length === 0 ? (
              "—"
            ) : (
              <div className="space-y-2">
                {data.villages.map((village) => (
                  <div key={village.id}>
                    <p>{village.village_name}</p>
                    <p className="text-xs text-neutral-500">
                      {[village.mandal, village.district, village.state]
                        .filter(Boolean)
                        .join(" · ") || "Location not recorded"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DetailRow>
          <DetailRow label="Supervisors">
            <PeopleList people={data.supervisors} />
          </DetailRow>
          <DetailRow label="Climapreneurs">
            <PeopleList people={data.climapreneurs} />
          </DetailRow>
        </dl>
      </section>
    </div>
  );
}
