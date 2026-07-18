"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listFeedstocks } from "./actions";
import {
  formatLabStatus,
  producerLabel,
  resolveFeedstockProducer,
} from "./feedstockLib";
import type { FeedstockDetail, FeedstockTableRow } from "@/types";

export default function FeedstockPage() {
  const [rows, setRows] = useState<FeedstockTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
            bulk_density: `${feedstock.biochar_bulk_density_kg_m3} kg/m³`,
            carbon_content: `${feedstock.carbon_content_percent}%`,
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

      <DataTable
        loading={loading}
        columns={[
          { key: "biomass_type", label: "Biomass type" },
          { key: "producer", label: "Producer" },
          { key: "bulk_density", label: "Bulk density" },
          { key: "carbon_content", label: "Carbon content" },
          { key: "lab_status", label: "Lab status" },
        ]}
        rows={rows}
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
