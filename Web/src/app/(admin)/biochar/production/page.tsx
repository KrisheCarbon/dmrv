"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PyrolysisBatchStatusValue } from "@krishecarbon/shared";
import BiocharRightDrawer, { BIOCHAR_DRAWER_OFFSET_CLASS } from "../BiocharRightDrawer";
import DataTable from "@/components/table/DataTable";
import PyrolysisBatchReviewPanel from "./PyrolysisBatchReviewPanel";
import StatusBadge from "./StatusBadge";
import { listPyrolysisBatches } from "./actions";
import {
  formatBatchLabel,
  formatReviewStatus,
  reviewStatusTone,
  type PyrolysisBatchDetail,
  type PyrolysisBatchTableRow,
} from "./productionLib";

type ProductionTableRow = PyrolysisBatchTableRow & {
  review_status_raw: PyrolysisBatchStatusValue;
};

export default function ProductionPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProductionTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listPyrolysisBatches();
      setRows(
        data.map((batch) => ({
          id: batch.id,
          batch_label: formatBatchLabel(batch),
          kontikki_code: batch.kontikki_code,
          producer: batch.producer_name,
          producer_id: batch.producer_id,
          operator_name: batch.operator_name,
          session_status: batch.session_status,
          review_status: formatReviewStatus(batch.review_status),
          review_status_raw: batch.review_status,
          yield_percent:
            batch.yield_percent != null ? `${batch.yield_percent}%` : "—",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batches");
      setRows([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleBatchSubmitted(batch: PyrolysisBatchDetail) {
    const status = batch.batch_status?.status ?? "pending";
    setRows((current) =>
      current.map((row) =>
        row.id === batch.id
          ? {
              ...row,
              review_status: formatReviewStatus(status),
              review_status_raw: status,
            }
          : row,
      ),
    );
  }

  return (
    <div
      className={`space-y-4 transition-[margin] duration-300 ease-out ${
        selectedId ? BIOCHAR_DRAWER_OFFSET_CLASS : ""
      }`}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          Production
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Select a batch to review inline, or open a batch on its own page.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load production batches: {error}
        </div>
      ) : null}

      <DataTable
        loading={loading}
        selectedRowId={selectedId}
        onRowClick={(row) => setSelectedId(String(row.id))}
        columns={[
          { key: "batch_label", label: "Batch" },
          { key: "kontikki_code", label: "Kontikki" },
          {
            key: "producer",
            label: "Producer",
            render: (_value, row) =>
              row.producer_id && row.producer !== "—" ? (
                <Link
                  href={`/network/biochar-producers/${row.producer_id}`}
                  className="font-medium text-brand-dark hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {row.producer}
                </Link>
              ) : (
                row.producer
              ),
          },
          { key: "operator_name", label: "Operator" },
          { key: "session_status", label: "Session" },
          {
            key: "review_status",
            label: "Status",
            render: (_value, row) => (
              <StatusBadge
                label={row.review_status}
                tone={reviewStatusTone(
                  (row as ProductionTableRow).review_status_raw,
                )}
              />
            ),
          },
          { key: "yield_percent", label: "Yield" },
        ]}
        rows={rows}
        actions={(row) => (
          <button
            type="button"
            onClick={() => router.push(`/biochar/production/${row.id}`)}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            Open
          </button>
        )}
      />

      <BiocharRightDrawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        {selectedId ? (
          <PyrolysisBatchReviewPanel
            key={selectedId}
            batchId={selectedId}
            embedded
            onClose={() => setSelectedId(null)}
            onSubmitted={handleBatchSubmitted}
          />
        ) : null}
      </BiocharRightDrawer>
    </div>
  );
}
