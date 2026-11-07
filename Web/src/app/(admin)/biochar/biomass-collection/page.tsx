"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import ListToolbar from "@/components/table/ListToolbar";
import { useSearchFilterChips } from "@/hooks/useSearchFilterChips";
import { hasActiveListFilters, matchesAllSearchTerms } from "@/lib/listFilters";
import BiocharRightDrawer, { BIOCHAR_DRAWER_OFFSET_CLASS } from "../BiocharRightDrawer";
import BiomassCollectionPanel from "./BiomassCollectionPanel";
import { listBiomassCollections } from "./actions";
import {
  biomassCollectionSearchIndex,
  farmDistanceFlagText,
  farmDistanceSummary,
  formatApplicationAcres,
  formatDateTime,
  transitDuration,
  travelSummary,
  type BiomassCollectionTableRow,
} from "./biomassCollectionLib";

export default function BiomassCollectionPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BiomassCollectionTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    searchDraft,
    setSearchDraft,
    searchFilters,
    addSearchFilter,
    removeSearchFilter,
    clearSearchFilters,
  } = useSearchFilterChips();
  const [siteFilter, setSiteFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listBiomassCollections();
      setRows(
        data.map((record) => {
          const distance = farmDistanceSummary(record);
          const travel = travelSummary(record);
          return {
            id: record.id,
            loaded: formatDateTime(record.loaded_at),
            unloaded: formatDateTime(record.unloaded_at),
            farm_name: record.sources?.length
              ? record.sources.length === 1
                ? `${record.sources[0].farm_name ?? "Farmer"} · ${record.sources[0].field_code ?? "plot"}`
                : `${record.sources[0].farm_name ?? "Farmer"} · ${record.sources[0].field_code ?? "plot"} + ${record.sources.length - 1} more`
              : record.farm_name ?? "—",
            farm_id: record.farm_id,
            field_code: record.field_code ?? "—",
            farm_acres: formatApplicationAcres(record.farm_area_acres),
            producer_name: record.producer_name ?? "—",
            producer_site_id: record.producer_site_id ?? "",
            site_name: record.site_name ?? "—",
            tractor_number: record.tractor_number?.trim() || "—",
            operator_name: record.operator_name ?? "Unknown",
            distance_label: distance.short,
            distance_detail: distance.detail,
            distance_flag: farmDistanceFlagText(distance),
            distance_known: distance.distanceM != null,
            distance_outside: distance.outsideLimit,
            travel_label: travel.short,
            travel_detail: travel.detail,
            transit: transitDuration(record) ?? "—",
            search_index: biomassCollectionSearchIndex(record),
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load biomass collections");
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const siteOptions = useMemo(() => {
    const byProducer = new Map<string, Map<string, string>>();
    for (const row of rows) {
      if (!row.producer_site_id || row.site_name === "—") continue;
      const producer = row.producer_name !== "—" ? row.producer_name : "Producer";
      const sites = byProducer.get(producer) ?? new Map<string, string>();
      sites.set(row.producer_site_id, row.site_name);
      byProducer.set(producer, sites);
    }
    return [...byProducer.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([producer, sites]) =>
        [...sites.entries()]
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([value, label]) => ({ value, label, group: producer })),
      );
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!siteFilter || row.producer_site_id === siteFilter) &&
          matchesAllSearchTerms(searchFilters, row.search_index),
      ),
    [rows, searchFilters, siteFilter],
  );

  const filtersActive = hasActiveListFilters(searchFilters, siteFilter);

  return (
    <div
      className={`space-y-4 transition-[margin] duration-300 ease-out ${
        selectedId ? BIOCHAR_DRAWER_OFFSET_CLASS : ""
      }`}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Biomass collection
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tractor loads photographed at a chosen farm plot, and again when unloaded at the
          production site. A load more than 1 km from the farm polygon is flagged in yellow.
          Within 1 km is shown in green. Farm acres come from the mapped plot.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load biomass collections: {error}
        </div>
      ) : null}

      <ListToolbar
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        searchFilters={searchFilters}
        onAddSearchFilter={addSearchFilter}
        onRemoveSearchFilter={removeSearchFilter}
        onClearSearchFilters={clearSearchFilters}
        searchPlaceholder="Search farmer, plot, site, tractor number, operator…"
        filteredCount={filteredRows.length}
        totalCount={rows.length}
        filters={[
          {
            id: "production-site",
            label: "Production site",
            value: siteFilter,
            onChange: setSiteFilter,
            options: [{ value: "", label: "All sites" }, ...siteOptions],
          },
        ]}
      />

      <DataTable
        loading={loading}
        emptyText={
          filtersActive ? "No trips match your search or filters" : "No data found"
        }
        selectedRowId={selectedId}
        onRowClick={(row) => setSelectedId(String(row.id))}
        columns={[
          { key: "loaded", label: "Loaded" },
          {
            key: "farm_name",
            label: "Farmer",
            render: (_value, row) =>
              row.farm_id && row.farm_name !== "—" ? (
                <Link
                  href={`/network/farmers/${row.farm_id}`}
                  className="font-medium text-brand-dark hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {row.farm_name}
                </Link>
              ) : (
                row.farm_name
              ),
          },
          { key: "field_code", label: "Plot" },
          { key: "farm_acres", label: "Farm acres" },
          {
            key: "site_name",
            label: "Production site",
            render: (_value, row) => (
              <div className="min-w-0">
                {row.producer_name !== "—" ? (
                  <div className="text-xs text-neutral-500">{row.producer_name}</div>
                ) : null}
                <div>{row.site_name}</div>
              </div>
            ),
          },
          { key: "tractor_number", label: "Tractor" },
          {
            key: "distance_label",
            label: "From farm",
            render: (_value, row) =>
              row.distance_known ? (
                <span
                  title={String(row.distance_detail ?? "")}
                  className={
                    row.distance_outside
                      ? "inline-flex rounded-xl bg-status-warning-bg px-2.5 py-1 text-xs font-medium text-status-warning"
                      : "inline-flex rounded-xl bg-status-success-bg px-2.5 py-1 text-xs font-medium text-status-success"
                  }
                >
                  {row.distance_flag}
                </span>
              ) : (
                <span className="text-sm text-neutral-950" title={String(row.distance_detail ?? "")}>
                  {row.distance_label}
                </span>
              ),
          },
          {
            key: "travel_label",
            label: "Travelled",
            render: (_value, row) => (
              <span className="text-neutral-950" title={String(row.travel_detail ?? "")}>
                {row.travel_label}
              </span>
            ),
          },
          { key: "transit", label: "Transit" },
          { key: "unloaded", label: "Unloaded" },
          { key: "operator_name", label: "Operator" },
        ]}
        rows={filteredRows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/biochar/biomass-collection/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />

      <BiocharRightDrawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        {selectedId ? (
          <BiomassCollectionPanel
            key={selectedId}
            collectionId={selectedId}
            embedded
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </BiocharRightDrawer>
    </div>
  );
}
