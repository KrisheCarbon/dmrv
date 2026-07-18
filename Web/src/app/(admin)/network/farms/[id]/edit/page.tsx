"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FarmForm from "../../FarmForm";
import { getFarm } from "../../actions";
import type { FarmDetail } from "@/types";

export default function FarmEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<FarmDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    getFarm(id)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load farm");
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
        <p className="text-sm text-red-600">Could not load farm: {error}</p>
        <button
          type="button"
          onClick={() => router.push("/network/farms")}
          className="text-sm text-brand-dark hover:underline"
        >
          Back to farms
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">Farm not found.</p>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/network/farms/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to farm
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit Farm
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.farmer_name}</p>
      </div>

      <FarmForm
        mode="edit"
        data={data}
        onSuccess={() => router.push(`/network/farms/${data.id}`)}
        onCancel={() => router.push(`/network/farms/${data.id}`)}
      />
    </div>
  );
}
