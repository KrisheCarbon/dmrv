"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FeedstockForm from "../../FeedstockForm";
import { getFeedstock } from "../../actions";
import type { FeedstockDetail } from "@/types";

export default function FeedstockEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<FeedstockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadFeedstock() {
      try {
        const feedstock = await getFeedstock(id);
        setData(feedstock);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load feedstock",
        );
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    loadFeedstock();
  }, [id]);

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/biochar/feedstock/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to feedstock
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit Feedstock
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.biomass_type}</p>
      </div>

      <FeedstockForm
        mode="edit"
        data={data}
        onSuccess={() => router.push(`/biochar/feedstock/${data.id}`)}
        onCancel={() => router.push(`/biochar/feedstock/${data.id}`)}
      />
    </div>
  );
}
