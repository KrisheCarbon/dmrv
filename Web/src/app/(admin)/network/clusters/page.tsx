"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listClusters } from "./actions";
import type { ClusterDetail, ClusterTableRow } from "@/types";
import { unwrapQuery } from "@/lib/queryResult";

function names(people: Array<{ full_name: string }>) {
  if (people.length === 0) return "—";
  return people.map((person) => person.full_name).join(", ");
}

function mapRow(cluster: ClusterDetail): ClusterTableRow {
  return {
    id: cluster.id,
    name: cluster.name,
    villages:
      cluster.villages.length > 0
        ? cluster.villages
            .map((village) =>
              [village.village_name, village.mandal, village.district]
                .filter(Boolean)
                .join(", "),
            )
            .join(" · ")
        : "—",
    villageCount: cluster.villages.length,
    supervisors: names(cluster.supervisors),
    climapreneurs: names(cluster.climapreneurs),
  };
}

export default function ClustersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClusterTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = unwrapQuery(await listClusters(), "Failed to load clusters");
      setRows(data.map(mapRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clusters");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Clusters
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Village groups with assigned supervisors and climapreneurs.
          </p>
        </div>
        <Link
          href="/network/clusters/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add cluster
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load clusters: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        emptyText="No clusters yet. Create one to group villages and field staff."
        columns={[
          {
            key: "name",
            label: "Cluster",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search name",
          },
          {
            key: "villages",
            label: "Villages",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search village",
            sortValue: (row) => row.villageCount,
          },
          {
            key: "supervisors",
            label: "Supervisors",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search supervisor",
          },
          {
            key: "climapreneurs",
            label: "Climapreneurs",
            filterable: true,
            sortable: true,
            filterPlaceholder: "Search climapreneur",
          },
        ]}
        rows={rows}
        onRowClick={(row) => router.push(`/network/clusters/${row.id}`)}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/clusters/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
