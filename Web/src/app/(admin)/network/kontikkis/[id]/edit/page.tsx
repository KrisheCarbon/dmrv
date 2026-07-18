"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import KontikkiForm from "../../KontikkiForm";
import { getKontikki } from "../../actions";
import type { KontikkiDetail } from "@/types";

export default function KontikkiEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<KontikkiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchKontikki() {
      try {
        const row = await getKontikki(id);
        setData(row);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load kontikki");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchKontikki();
  }, [id]);

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/network/kontikkis/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to kontikki
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit Pyrolysis Unit (Kon-Tiki)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.kontikki_code}</p>
      </div>

      <KontikkiForm
        mode="edit"
        data={data}
        onSuccess={() => router.push(`/network/kontikkis/${data.id}`)}
        onCancel={() => router.push(`/network/kontikkis/${data.id}`)}
      />
    </div>
  );
}
