"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { unwrapQuery } from "@/lib/queryResult";
import { listFarmFields } from "./actions";
import type { FarmFieldRecord } from "@krishecarbon/shared";

interface FieldTableRow {
  id: string;
  farmer: string;
  fieldCode: string;
  ownership: string;
  area: string;
  crop: string;
  season: string;
  farmId: string;
  [key: string]: unknown;
}

export default function NetworkFieldsPage() {
  const [rows, setRows] = useState<FieldTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = unwrapQuery(
        await listFarmFields(),
        "Failed to load fields",
      );
      setRows(
        data.map((field: FarmFieldRecord) => ({
          id: field.id,
          farmer: field.farm?.farmer_name || "—",
          fieldCode: field.field_code,
          ownership: String(field.ownership_type),
          area: field.calculated_area != null ? `${field.calculated_area}` : "—",
          crop: field.crop_name || "—",
          season: field.season || "—",
          farmId: field.farm_id,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fields");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Fields
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Field plots onboarded for farmers. Area is stored in acres.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load fields: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "farmer", label: "Farmer" },
          { key: "fieldCode", label: "Field ID" },
          { key: "ownership", label: "Ownership" },
          { key: "area", label: "Acres" },
          { key: "crop", label: "Crop" },
          { key: "season", label: "Season" },
        ]}
        rows={rows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/farms/${row.farmId}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open farmer
          </button>
        )}
      />
    </div>
  );
}
