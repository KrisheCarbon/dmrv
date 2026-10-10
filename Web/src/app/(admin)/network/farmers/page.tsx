"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable, {
  DEFAULT_TABLE_QUERY,
  type DataTableQuery,
} from "@/components/table/DataTable";
import { listFarmsPage } from "../farms/actions";
import { listFarmFieldsForFarmers } from "../fields/actions";
import { listSoilTestsForFarmers } from "../soil-tests/actions";
import FarmerChecklist from "./FarmerChecklist";
import { buildFarmerChecklist, sampleToneClass } from "./farmerLib";
import FarmerPortrait from "@/components/FarmerPortrait";
import { useIsDmrvViewer } from "@/components/DmrvViewerGate";
import type { FarmDetail } from "@/types";
import type {
  FarmFieldRecord,
  SoilSampleTone,
  SoilTestRecord,
} from "@krishecarbon/shared";

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

function positiveAcres(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export default function FarmersPage() {
  const router = useRouter();
  const readOnly = useIsDmrvViewer();
  const [farms, setFarms] = useState<FarmDetail[]>([]);
  const [fields, setFields] = useState<FarmFieldRecord[]>([]);
  const [tests, setTests] = useState<SoilTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<DataTableQuery>(DEFAULT_TABLE_QUERY);
  const [total, setTotal] = useState(0);
  const requestRef = useRef(0);

  // Only the current page of farmers is fetched, then their farms and samples.
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
      if (farmResult.error || farmResult.data == null) {
        throw new Error(farmResult.error || "Failed to load farmers");
      }
      const ids = farmResult.data.rows.map((farm) => farm.id);
      const [fieldResult, testResult] = await Promise.all([
        listFarmFieldsForFarmers(ids),
        listSoilTestsForFarmers(ids),
      ]);
      // A newer page request has started; drop this stale answer.
      if (requestId !== requestRef.current) return;

      setFarms(farmResult.data.rows);
      setTotal(farmResult.data.total);
      setFields(fieldResult.data ?? []);
      setTests(testResult.data ?? []);

      const extraErrors = [fieldResult, testResult]
        .map((result) => result.error)
        .filter((message): message is string => Boolean(message));
      if (extraErrors.length) {
        setError(`Some farmer network data could not load: ${extraErrors.join(" · ")}`);
      }
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
    const fieldsByFarm = new Map<string, FarmFieldRecord[]>();
    for (const field of fields) {
      const list = fieldsByFarm.get(field.farm_id) ?? [];
      list.push(field);
      fieldsByFarm.set(field.farm_id, list);
    }
    const testsByFarm = new Map<string, SoilTestRecord[]>();
    for (const test of tests) {
      const list = testsByFarm.get(test.farm_id) ?? [];
      list.push(test);
      testsByFarm.set(test.farm_id, list);
    }
    return farms.map((farm): FarmerRow => {
      const farmFields = fieldsByFarm.get(farm.id) ?? [];
      const activeFields = farmFields.filter((field) => field.status !== "inactive");
      const farmTests = testsByFarm.get(farm.id) ?? [];
      const checklist = buildFarmerChecklist(farmFields, farmTests, [], farm);
      const village = [farm.village, farm.mandal, farm.district]
        .filter(Boolean)
        .join(", ");
      const farmOnboardedAt = activeFields.reduce((earliest, field) => {
        const time = dateSortValue(field.created_at);
        if (time <= 0) return earliest;
        return earliest === 0 || time < earliest ? time : earliest;
      }, 0);
      const farmAcresValue = activeFields.reduce(
        (sum, field) => sum + positiveAcres(field.calculated_area),
        0,
      );
      const totalAcresValue = Number(farm.total_land_size);
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
        farmOnboarded: farmOnboardedAt
          ? formatOnboardedDate(new Date(farmOnboardedAt).toISOString())
          : "—",
        farmOnboardedAt,
        totalAcres: formatAcres(
          Number.isFinite(totalAcresValue) ? totalAcresValue : null,
        ),
        totalAcresValue: Number.isFinite(totalAcresValue) ? totalAcresValue : 0,
        farmAcres: activeFields.length > 0 ? formatAcres(farmAcresValue) : "—",
        farmAcresValue,
        farms: checklist.hasFarms ? String(checklist.farmCount) : "None",
        farmCount: checklist.farmCount,
        sample: checklist.sampleLabel,
        hasFarms: checklist.hasFarms,
        sampleTone: checklist.sampleTone,
        hasReport: checklist.hasReport,
        hasCompleteProfile: checklist.hasCompleteProfile,
      };
    });
  }, [farms, fields, tests]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            {readOnly ? "Mixing farms" : "Farmers"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {readOnly
              ? "Farms where biochar was mixed and applied."
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
              <div className="min-w-[12rem]">
                <span className="flex items-center gap-2">
                  {row.photo ? (
                    <FarmerPortrait
                      src={row.photo}
                      alt={row.name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-500">
                      {row.name.slice(0, 1).toUpperCase()}
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
          {
            key: "mobile",
            label: "Mobile",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search mobile",
          },
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
          {
            key: "sample",
            label: "Soil sample",
            sortable: false,
            render: (_value, row) => (
              <span className={`text-sm font-medium ${sampleToneClass(row.sampleTone)}`}>
                {row.sample}
              </span>
            ),
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
