"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PartnerForm from "../../PartnerForm";
import { getPartner } from "../../actions";
import type { PartnerOrg } from "@/types";

export default function PartnerEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<PartnerOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadPartner() {
      try {
        const partner = await getPartner(id);
        setData(partner);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load partner");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    loadPartner();
  }, [id]);

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
          onClick={() => router.push(`/network/partners/${data.id}`)}
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
        >
          ← Back to partner
        </button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Edit Partner
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{data.org_name}</p>
      </div>

      <PartnerForm
        mode="edit"
        data={data}
        onSuccess={() => router.push(`/network/partners/${data.id}`)}
        onCancel={() => router.push(`/network/partners/${data.id}`)}
      />
    </div>
  );
}
