"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BiocharProducerForm from "../../BiocharProducerForm";
import { getProducer } from "../../actions";
import type { BiocharProducerDetail } from "@/types";

export default function BiocharProducerEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<BiocharProducerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    getProducer(id)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load producer");
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/network/biochar-producers/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to producer
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit Biochar Producer
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.name}</p>
      </div>

      <BiocharProducerForm
        mode="edit"
        data={data}
        onCancel={() => router.push(`/network/biochar-producers/${data.id}`)}
      />
    </div>
  );
}
