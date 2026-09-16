"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listFarms } from "../farms/actions";
import { listFarmFields } from "../fields/actions";
import { listSoilTests } from "../soil-tests/actions";
import FarmerChecklist from "./FarmerChecklist";
import { buildFarmerChecklist, sampleToneClass } from "./farmerLib";
import FarmerPortrait from "@/components/FarmerPortrait";
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
  code: string;
  mobile: string;
  village: string;
  cluster: string;
  state: string;
  farms: string;
  farmCount: number;
  sample: string;
  hasFarms: boolean;
  sampleTone: SoilSampleTone;
  hasReport: boolean;
  hasCompleteProfile: boolean;
  [key: string]: unknown;
}

type StatusFilter =
  | "all"
  | "no-farms"
  | "sample-pending"
  | "rejected"
  | "complete";

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All farmers" },
  { key: "no-farms", label: "No farms" },
  { key: "sample-pending", label: "Sample pending" },
  { key: "rejected", label: "Sample rejected" },
  { key: "complete", label: "Complete" },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load farmers";
}

export default function FarmersPage() {
  const router = useRouter();
  const [farms, setFarms] = useState<FarmDetail[]>([]);
  const [fields, setFields] = useState<FarmFieldRecord[]>([]);
  const [tests, setTests] = useState<SoilTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [farmResult, fieldResult, testResult] = await Promise.allSettled([
        listFarms(),
        listFarmFields(),
        listSoilTests(),
      ]);

      if (farmResult.status === "rejected") {
        throw farmResult.reason;
      }
      setFarms(farmResult.value);
      setFields(fieldResult.status === "fulfilled" ? fieldResult.value : []);
      setTests(testResult.status === "fulfilled" ? testResult.value : []);

      const extraErrors = [fieldResult, testResult]
        .filter((result) => result.status === "rejected")
        .map((result) => errorMessage(result.reason));
      if (extraErrors.length) {
        setError(`Some farmer network data could not load: ${extraErrors.join(" · ")}`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setFarms([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      const farmTests = testsByFarm.get(farm.id) ?? [];
      const checklist = buildFarmerChecklist(farmFields, farmTests, [], farm);
      const village = [farm.village, farm.mandal, farm.district]
        .filter(Boolean)
        .join(", ");
      return {
        id: farm.id,
        name: farm.farmer_name,
        photo: farm.farmer_photo_url || "",
        code: farm.farmer_code || "—",
        mobile: farm.mobile_number ?? "—",
        village: village || farm.address || "—",
        cluster: farm.cluster?.name?.trim() || "—",
        state: farm.state?.trim() || "—",
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

  const filteredRows = rows.filter((row) => {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (filter === "no-farms") return !row.hasFarms;
    if (filter === "sample-pending") return row.sampleTone === "collected";
    if (filter === "rejected") return row.sampleTone === "rejected";
    if (filter === "complete") {
      return row.hasFarms && row.sampleTone === "accepted" && row.hasReport;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Farmers
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Farmer info, farms, soil samples, and reports.
          </p>
        </div>
        <Link
          href="/network/farmers/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add farmer
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm sm:w-48"
        >
          {FILTERS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Search farmer name"
          className="w-full max-w-md rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
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
            key: "code",
            label: "Farmer ID",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search ID",
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
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search cluster",
          },
          {
            key: "state",
            label: "State",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search state",
          },
          {
            key: "farms",
            label: "Farms",
            filterable: true,
            sortable: true,
            filterPlaceholder: "None or count",
            sortValue: (row) => row.farmCount,
          },
          {
            key: "sample",
            label: "Soil sample",
            filterable: true,
            sortable: true,
            filterOptions: [
              { value: "Not collected", label: "Not collected" },
              { value: "Collected", label: "Collected" },
              { value: "Submitted to supervisor", label: "Submitted" },
              { value: "Stored", label: "Stored" },
              { value: "Rejected", label: "Rejected" },
              { value: "Accepted", label: "Accepted" },
              { value: "Report ready", label: "Report ready" },
            ],
            render: (_value, row) => (
              <span className={`text-sm font-medium ${sampleToneClass(row.sampleTone)}`}>
                {row.sample}
              </span>
            ),
          },
        ]}
        rows={filteredRows}
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
