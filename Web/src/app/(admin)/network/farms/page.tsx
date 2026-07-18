"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listFarms } from "./actions";
import type { FarmerTableRow } from "@/types";

export default function FarmsPage() {
  const [rows, setRows] = useState<FarmerTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchFarms = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listFarms();
      setRows(
        data.map((f) => ({
          id: f.id,
          name: f.farmer_name,
          mobile: f.mobile_number ?? "—",
          address: f.address ?? "—",
          landSize: Number(f.total_land_size) || 0,
          biomass: Number(f.estimated_biomass) || 0,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load farms");
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFarms();
  }, [fetchFarms]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Farms
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage farmer records, crops, and biomass potential.
          </p>
        </div>
        <Link
          href="/network/farms/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add farm
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load farms: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "name", label: "Farmer name" },
          { key: "mobile", label: "Mobile" },
          { key: "address", label: "Address" },
          { key: "landSize", label: "Land (acres)" },
          { key: "biomass", label: "Potential biomass (tons)" },
        ]}
        rows={rows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/farms/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
