"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import { listKontikkis } from "./actions";
import {
  resolveOperatorNames,
  resolveProducerName,
} from "./kontikkiQueries";
import { formatKontikkiCapacity, resolveKontikkiCapacity } from "./kontikkiLib";
import type { KontikkiTableRow } from "@/types";

export default function KontikkisPage() {
  const [kontikkis, setKontikkis] = useState<KontikkiTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchKontikkis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listKontikkis();
      setKontikkis(
        data.map((k) => {
          const producer = Array.isArray(k.biochar_producer)
            ? k.biochar_producer[0]
            : k.biochar_producer;

          return {
            id: k.id,
            kontikki_code: k.kontikki_code ?? "—",
            module_id: k.module_id?.trim() || "—",
            producer: resolveProducerName(k),
            producer_id: producer?.id ?? k.biochar_producer_id ?? null,
            capacity: formatKontikkiCapacity(resolveKontikkiCapacity(k)),
            operators: resolveOperatorNames(k),
            status:
              k.status === "inactive"
                ? "Inactive"
                : k.status === "active"
                  ? "Active"
                  : "—",
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kontikkis");
      setKontikkis([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKontikkis();
  }, [fetchKontikkis]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
            Kontikkis
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage pyrolysis units across your producer network.
          </p>
        </div>
        <Link
          href="/network/kontikkis/new"
          className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark-hover"
        >
          + Add kontikki
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load kontikkis: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        columns={[
          { key: "kontikki_code", label: "Kontikki ID" },
          { key: "module_id", label: "Module ID" },
          {
            key: "producer",
            label: "Producer",
            render: (_value, row) =>
              row.producer_id && row.producer !== "—" ? (
                <Link
                  href={`/network/biochar-producers/${row.producer_id}`}
                  className="font-medium text-brand-dark hover:underline"
                >
                  {row.producer}
                </Link>
              ) : (
                row.producer
              ),
          },
          { key: "capacity", label: "Capacity" },
          { key: "operators", label: "Operators" },
          { key: "status", label: "Status" },
        ]}
        rows={kontikkis}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/network/kontikkis/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />
    </div>
  );
}
