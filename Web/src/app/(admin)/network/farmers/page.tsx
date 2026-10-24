"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable, {
  DEFAULT_TABLE_QUERY,
  type DataTableQuery,
} from "@/components/table/DataTable";
import { listFarmsPage } from "../farms/actions";
import { useIsDmrvViewer } from "@/components/DmrvViewerGate";
import type { FarmDetail } from "@/types";

interface FarmerRow {
  id: string;
  name: string;
  mobile: string;
  village: string;
  cluster: string;
  state: string;
  farmerOnboarded: string;
  farmerOnboardedAt: number;
  totalAcres: string;
  totalAcresValue: number;
  [key: string]: unknown;
}

/** Table column → server search parameter (see GET /farms?page=…). */
const SERVER_FILTERS: Record<string, string> = {
  name: "name",
  mobile: "mobile",
  village: "location",
  state: "state",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load farmers";
}

function formatOnboardedDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function dateSortValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatAcres(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function FarmersPage() {
  const router = useRouter();
  const readOnly = useIsDmrvViewer();
  const [farms, setFarms] = useState<FarmDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<DataTableQuery>(DEFAULT_TABLE_QUERY);
  const [total, setTotal] = useState(0);
  const requestRef = useRef(0);

  const loadData = useCallback(async (current: DataTableQuery) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(current.filters)) {
        if (SERVER_FILTERS[key]) filters[SERVER_FILTERS[key]] = value;
      }
      const farmResult = await listFarmsPage({
        page: current.page,
        pageSize: current.pageSize,
        sort: current.sortKey,
        dir: current.sortDir,
        filters,
      });
      if (requestId !== requestRef.current) return;
      if (farmResult.error || farmResult.data == null) {
        throw new Error(farmResult.error || "Failed to load farmers");
      }
      setFarms(farmResult.data.rows);
      setTotal(farmResult.data.total);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(errorMessage(err));
      setFarms([]);
      setTotal(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData(query);
  }, [loadData, query]);

  const rows = useMemo(() => {
    return farms.map((farm): FarmerRow => {
      const village = [farm.village, farm.mandal, farm.district]
        .filter(Boolean)
        .join(", ");
      const totalAcresValue = Number(farm.total_land_size);
      return {
        id: farm.id,
        name: farm.farmer_name,
        mobile: farm.mobile_number ?? "—",
        village: village || farm.address || "—",
        cluster: farm.cluster?.name?.trim() || "—",
        state: farm.state?.trim() || "—",
        farmerOnboarded: formatOnboardedDate(farm.created_at),
        farmerOnboardedAt: dateSortValue(farm.created_at),
        totalAcres: formatAcres(
          Number.isFinite(totalAcresValue) ? totalAcresValue : null,
        ),
        totalAcresValue: Number.isFinite(totalAcresValue) ? totalAcresValue : 0,
      };
    });
  }, [farms]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Farmers
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {readOnly
              ? "Farmer names, locations, and acreage. Open a farmer to see their farms."
              : "Names, locations, and acreage. Open a farmer to load farms, samples, and reports."}
          </p>
        </div>
        {readOnly ? null : (
        <Link
          href="/network/farmers/new"
          className="inline-flex min-h-14 items-center rounded-xl bg-brand-dark px-4 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add farmer
        </Link>
        )}
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        server={{ total, query, onQueryChange: setQuery }}
        emptyText="No farmers found."
        columns={[
          {
            key: "name",
            label: "Farmer",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search name",
            render: (_value, row) => (
              <span className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-500">
                  {String(row.name).slice(0, 1).toUpperCase()}
                </span>
                <span>{row.name}</span>
              </span>
            ),
          },
          ...(readOnly
            ? []
            : [
                {
                  key: "mobile",
                  label: "Mobile",
                  filterable: true,
                  sortable: true,
                  filterPlaceholder: "Search mobile",
                },
              ]),
          {
            key: "village",
            label: "Location",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search village",
          },
          {
            key: "cluster",
            label: "Cluster",
            sortable: false,
          },
          {
            key: "state",
            label: "State",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search state",
          },
          {
            key: "farmerOnboarded",
            label: "Farmer onboarded",
            sortable: true,
            sortValue: (row) => row.farmerOnboardedAt,
          },
          {
            key: "totalAcres",
            label: "Total acres",
            sortable: true,
            sortValue: (row) => row.totalAcresValue,
          },
        ]}
        rows={rows}
        onRowClick={(row) => router.push(`/network/farmers/${row.id}`)}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/farmers/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
