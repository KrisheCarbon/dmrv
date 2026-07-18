"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listPartners } from "./actions";
import type { PartnerOrg } from "@/types";

interface PartnerRow extends Record<string, unknown> {
  id: string;
  org_name: string;
  base_location: string;
  farmer_base: number;
  status: string;
}

function formatPartnerStatus(status?: string) {
  if (status === "inactive") return "Inactive";
  if (status === "active") return "Active";
  return status ?? "—";
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listPartners();
      setPartners(
        data.map((partner: PartnerOrg) => ({
          id: partner.id,
          org_name: partner.org_name,
          base_location: partner.base_location ?? "—",
          farmer_base: partner.farmer_base ?? 0,
          status: formatPartnerStatus(partner.status),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partners");
      setPartners([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Partners
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage partner organisations across your network.
          </p>
        </div>
        <Link
          href="/network/partners/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add partner
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load partners: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "org_name", label: "Organisation" },
          { key: "base_location", label: "Base location" },
          { key: "farmer_base", label: "Farmers" },
          { key: "status", label: "Status" },
        ]}
        rows={partners}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/partners/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
