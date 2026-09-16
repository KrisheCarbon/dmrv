"use client";

import { useRouter } from "next/navigation";
import ClusterForm from "../ClusterForm";

export default function NewClusterPage() {
  const router = useRouter();

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
          Add cluster
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Name the cluster, add villages with mandal/block, district, and
          state, and assign supervisors and climapreneurs.
        </p>
      </div>

      <ClusterForm
        mode="create"
        onSuccess={(id) => router.push(`/network/clusters/${id}`)}
        onCancel={() => router.push("/network/clusters")}
      />
    </div>
  );
}
