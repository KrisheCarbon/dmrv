"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import ListToolbar from "@/components/table/ListToolbar";
import { useSearchFilterChips } from "@/hooks/useSearchFilterChips";
import { hasActiveListFilters, matchesAllSearchTerms } from "@/lib/listFilters";
import { listFeedstocks } from "./actions";
import {
  feedstockSearchIndex,
  formatLabStatus,
  LAB_STATUS_OPTIONS,
  producerLabel,
  resolveFeedstockProducer,
} from "./feedstockLib";
import type { FeedstockDetail, FeedstockLabStatus } from "@/types";

type FeedstockListRow = {
  id: string;
  biomass_type: string;
  producer: string;
  producer_id: string;
  lab_status: string;
  lab_status_raw: FeedstockLabStatus;
  bulk_density: string;
  carbon_content: string;
  search_index: string;
};

export default function FeedstockPage() {
  const [rows, setRows] = useState<FeedstockListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    searchDraft,
    setSearchDraft,
    searchFilters,
    addSearchFilter,
    removeSearchFilter,
    clearSearchFilters,
  } = useSearchFilterChips();
  const [labStatusFilter, setLabStatusFilter] = useState("");
  const router = useRouter();

  const fetchFeedstocks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listFeedstocks();
      setRows(
        data.map((feedstock: FeedstockDetail) => {
          const producer = resolveFeedstockProducer(feedstock);
          return {
            id: feedstock.id,
            biomass_type: feedstock.biomass_type,
            producer: producerLabel(producer),
            producer_id: producer?.id ?? feedstock.biochar_producer_id,
            lab_status: formatLabStatus(feedstock.lab_status),
            lab_status_raw: feedstock.lab_status,
            bulk_density: `${feedstock.biochar_bulk_density_kg_m3} kg/m³`,
            carbon_content: `${feedstock.carbon_content_percent}%`,
            search_index: feedstockSearchIndex(feedstock),
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedstock");
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFeedstocks();
  }, [fetchFeedstocks]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesLabStatus =
          !labStatusFilter || row.lab_status_raw === labStatusFilter;
        const matchesQuery = matchesAllSearchTerms(
          searchFilters,
          row.search_index,
        );
        return matchesLabStatus && matchesQuery;
      }),
    [rows, searchFilters, labStatusFilter],
  );

  const filtersActive = hasActiveListFilters(searchFilters, labStatusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Feedstock
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage biomass feedstock sources, lab results, and producer supply
            chains.
          </p>
        </div>
        <Link
          href="/biochar/feedstock/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add feedstock
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load feedstock: {error}
        </div>
      ) : null}

      <ListToolbar
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        searchFilters={searchFilters}
        onAddSearchFilter={addSearchFilter}
        onRemoveSearchFilter={removeSearchFilter}
        onClearSearchFilters={clearSearchFilters}
        searchPlaceholder="Search biomass, producer, lab notes, preparation instructions…"
        filteredCount={filteredRows.length}
        totalCount={rows.length}
        filters={[
          {
            id: "lab-status",
            label: "Lab status",
            value: labStatusFilter,
            onChange: setLabStatusFilter,
            options: [
              { value: "", label: "All lab statuses" },
              ...LAB_STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            ],
          },
        ]}
      />

      <DataTable
        loading={loading}
        emptyText={
          filtersActive ? "No feedstock matches your search or filters" : "No data found"
        }
        columns={[
          { key: "biomass_type", label: "Biomass type" },
          { key: "producer", label: "Producer" },
          { key: "bulk_density", label: "Bulk density" },
          { key: "carbon_content", label: "Carbon content" },
          { key: "lab_status", label: "Lab status" },
        ]}
        rows={filteredRows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/biochar/feedstock/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
