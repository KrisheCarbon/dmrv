"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable, {
  DEFAULT_TABLE_QUERY,
  type DataTableQuery,
} from "@/components/table/DataTable";
import { listFarmsPage } from "../farms/actions";
import FarmerChecklist from "./FarmerChecklist";
import { sampleToneClass, sampleToneLabel } from "./farmerLib";
import FarmerPortrait from "@/components/FarmerPortrait";
import { useIsDmrvViewer } from "@/components/DmrvViewerGate";
import type { FarmDetail } from "@/types";
import {
  soilTestStatusLabel,
  type SoilSampleTone,
} from "@krishecarbon/shared";

interface FarmerListItem extends FarmDetail {
  profile_complete?: boolean;
  farm_count?: number;
  active_farm_count?: number;
  farm_onboarded_at?: string | null;
  farm_acres?: number | string | null;
  sample_tone?: SoilSampleTone;
  latest_sample_status?: string | null;
  has_report?: boolean;
}

interface FarmerRow {
  id: string;
  name: string;
  photo: string;
  mobile: string;
  village: string;
  cluster: string;
  state: string;
  farmerOnboarded: string;
  farmerOnboardedAt: number;
  farmOnboarded: string;
  farmOnboardedAt: number;
  totalAcres: string;
  totalAcresValue: number;
  farmAcres: string;
  farmAcresValue: number;
  farms: string;
  farmCount: number;
  sample: string;
  hasFarms: boolean;
  sampleTone: SoilSampleTone;
  hasReport: boolean;
  hasCompleteProfile: boolean;
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

function asTone(value: string | null | undefined): SoilSampleTone {
  if (value === "collected" || value === "rejected" || value === "accepted") {
    return value;
  }
  return "none";
}

const RECORD_OPTIONS = [
  { key: "farmer", label: "Farmers only" },
  { key: "farms", label: "Has farms" },
  { key: "samples", label: "Has soil samples" },
  { key: "reports", label: "Has reports" },
] as const;

type RecordKey = (typeof RECORD_OPTIONS)[number]["key"];

function recordChipClass(selected: boolean) {
  return `inline-flex min-h-12 items-center rounded-xl px-4 text-sm font-medium ${
    selected
      ? "bg-brand-dark text-white"
      : "border border-neutral-300 bg-white text-brand-dark"
  }`;
}

function recordSummary(selected: RecordKey[]) {
  if (selected.length === 0) return "All farmers.";
  if (selected.includes("farmer")) return "Farmers with no farm yet.";
  const labels = RECORD_OPTIONS.filter((option) => selected.includes(option.key)).map(
    (option) => option.label.replace(/^Has /, ""),
  );
  if (labels.length === 1) return `Farmers who have ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `Farmers who have ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

export default function FarmersPage() {
  const router = useRouter();
  const readOnly = useIsDmrvViewer();
  const [farms, setFarms] = useState<FarmerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<DataTableQuery>(DEFAULT_TABLE_QUERY);
  const [record, setRecord] = useState<RecordKey[]>([]);
  const [total, setTotal] = useState(0);
  const requestRef = useRef(0);

  const loadData = useCallback(async (current: DataTableQuery, selected: RecordKey[]) => {
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
        record: selected.length > 0 ? selected.join(",") : undefined,
      });
      if (requestId !== requestRef.current) return;
      if (farmResult.error || farmResult.data == null) {
        throw new Error(farmResult.error || "Failed to load farmers");
      }
      setFarms(farmResult.data.rows as FarmerListItem[]);
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
    loadData(query, record);
  }, [loadData, query, record]);

  function toggleRecord(key: RecordKey) {
    setRecord((current) => {
      if (key === "farmer") return current.includes("farmer") ? [] : ["farmer"];
      const next = current.filter((item) => item !== "farmer");
      return next.includes(key) ? next.filter((item) => item !== key) : [...next, key];
    });
    setQuery((current) => ({ ...current, page: 1 }));
  }

  const rows = useMemo(() => {
    return farms.map((farm): FarmerRow => {
      const village = [farm.village, farm.mandal, farm.district]
        .filter(Boolean)
        .join(", ");
      const totalAcresValue = Number(farm.total_land_size);
      const farmCount = Number(farm.farm_count) || 0;
      const activeFarms = Number(farm.active_farm_count) || 0;
      const farmAcresValue = Number(farm.farm_acres);
      const sampleTone = asTone(farm.sample_tone);
      return {
        id: farm.id,
        name: farm.farmer_name,
        photo: farm.farmer_photo_url || "",
        mobile: farm.mobile_number ?? "—",
        village: village || farm.address || "—",
        cluster: farm.cluster?.name?.trim() || "—",
        state: farm.state?.trim() || "—",
        farmerOnboarded: formatOnboardedDate(farm.created_at),
        farmerOnboardedAt: dateSortValue(farm.created_at),
        farmOnboarded: formatOnboardedDate(farm.farm_onboarded_at),
        farmOnboardedAt: dateSortValue(farm.farm_onboarded_at),
        totalAcres: formatAcres(
          Number.isFinite(totalAcresValue) ? totalAcresValue : null,
        ),
        totalAcresValue: Number.isFinite(totalAcresValue) ? totalAcresValue : 0,
        farmAcres: activeFarms > 0 && Number.isFinite(farmAcresValue)
          ? formatAcres(farmAcresValue)
          : "—",
        farmAcresValue: Number.isFinite(farmAcresValue) ? farmAcresValue : 0,
        farms: farmCount > 0 ? String(farmCount) : "None",
        farmCount,
        sample: farm.latest_sample_status
          ? soilTestStatusLabel(farm.latest_sample_status)
          : sampleToneLabel(sampleTone),
        hasFarms: farmCount > 0,
        sampleTone,
        hasReport: Boolean(farm.has_report),
        hasCompleteProfile: Boolean(farm.profile_complete),
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
              ? "Farmer names, locations, and acreage. View only."
              : "Farmer info, farms, soil samples, and reports."}
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

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2.5" role="group" aria-label="Filter farmers">
          <button
            type="button"
            aria-pressed={record.length === 0}
            onClick={() => {
              setRecord([]);
              setQuery((current) => ({ ...current, page: 1 }));
            }}
            className={recordChipClass(record.length === 0)}
          >
            {record.length === 0 ? "✓ " : ""}All
          </button>
          {RECORD_OPTIONS.map((option) => {
            const selected = record.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleRecord(option.key)}
                className={recordChipClass(selected)}
              >
                {selected ? "✓ " : ""}
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-text-secondary">{recordSummary(record)}</p>
      </div>

      <DataTable
        loading={loading}
        server={{ total, query, onQueryChange: setQuery }}
        emptyText={record.length > 0 ? "No farmers match this filter." : "No farmers found."}
        columns={[
          {
            key: "name",
            label: "Farmer",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search name",
            render: (_value, row) => (
              <div className="min-w-[12rem]">
                <span className="flex items-center gap-2">
                  {row.photo ? (
                    <FarmerPortrait
                      src={row.photo}
                      alt={String(row.name)}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-500">
                      {String(row.name).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span>{row.name}</span>
                </span>
                <div className="mt-1.5 pl-10">
                  <FarmerChecklist
                    hasCompleteProfile={row.hasCompleteProfile}
                    hasFarms={row.hasFarms}
                    sampleTone={row.sampleTone}
                    hasReport={row.hasReport}
                  />
                </div>
              </div>
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
            key: "farmOnboarded",
            label: "Farm onboarded",
            sortable: false,
          },
          {
            key: "totalAcres",
            label: "Total acres",
            sortable: true,
            sortValue: (row) => row.totalAcresValue,
          },
          {
            key: "farms",
            label: "Farms",
            sortable: false,
          },
          {
            key: "farmAcres",
            label: "Farm acres",
            sortable: false,
          },
          ...(readOnly
            ? []
            : [
                {
                  key: "sample",
                  label: "Soil sample",
                  sortable: false,
                  render: (_value: unknown, row: FarmerRow) => (
                    <span className={`text-sm font-medium ${sampleToneClass(row.sampleTone)}`}>
                      {row.sample}
                    </span>
                  ),
                },
              ]),
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
