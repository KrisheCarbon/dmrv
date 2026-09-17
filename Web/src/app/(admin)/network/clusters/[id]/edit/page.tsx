"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ClusterForm from "../../ClusterForm";
import { getCluster } from "../../actions";
import type { ClusterDetail } from "@/types";
import { unwrapQuery } from "@/lib/queryResult";

export default function ClusterEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getCluster(id)
      .then((result) =>
        setData(unwrapQuery(result, "Failed to load cluster")),
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load cluster");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

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
          onClick={() => router.push(`/network/clusters/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to cluster
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit cluster
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.name}</p>
      </div>

      <ClusterForm
        mode="edit"
        data={data}
        onSuccess={() => router.push(`/network/clusters/${data.id}`)}
        onCancel={() => router.push(`/network/clusters/${data.id}`)}
      />
    </div>
  );
}
