"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/table/DataTable";
import TemperatureTimeChart from "@/components/charts/TemperatureTimeChart";
import { getKilnBatch, listKilnBatches } from "./actions";
import type { KilnBatchDetail, KilnBatchSummary, KilnBatchTableRow } from "@/types";
import type { DataTableColumn } from "@/types";

const TABLE_COLUMNS: DataTableColumn<KilnBatchTableRow>[] = [
  { key: "batch_name", label: "Batch" },
  { key: "kontikki_code", label: "Kontikki" },
  { key: "kiln_id", label: "Sensor ID" },
  { key: "start_time", label: "Start (UTC)" },
  { key: "duration", label: "Duration" },
  { key: "data_points", label: "Points" },
];

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function toTableRow(batch: KilnBatchSummary, pointCount = "—"): KilnBatchTableRow {
  return {
    id: batch.id,
    batch_name: batch.batch_name,
    kontikki_code: batch.kontikki_code ?? "—",
    kiln_id: batch.kiln_id,
    start_time: new Date(batch.start_time_utc).toLocaleString(),
    duration: formatDuration(batch.duration_seconds),
    data_points: pointCount,
  };
}

export default function SensorDataPage() {
  const [batches, setBatches] = useState<KilnBatchSummary[]>([]);
  const [rows, setRows] = useState<KilnBatchTableRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<KilnBatchDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBatchDetail = useCallback(async (batchId: string) => {
    setLoadingDetail(true);
    setError(null);

    try {
      const detail = await getKilnBatch(batchId);
      setSelectedBatch(detail);
      setRows((current) =>
        current.map((row) =>
          row.id === batchId
            ? { ...row, data_points: String(detail.readings.length) }
            : row,
        ),
      );
    } catch (err) {
      setSelectedBatch(null);
      setError(err instanceof Error ? err.message : "Failed to load batch readings");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setLoadingList(true);
    setError(null);

    try {
      const data = await listKilnBatches();
      setBatches(data);
      setRows(data.map((batch) => toTableRow(batch)));

      if (data.length > 0) {
        setSelectedId(data[0].id);
        await loadBatchDetail(data[0].id);
      } else {
        setSelectedId(null);
        setSelectedBatch(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensor batches");
      setBatches([]);
      setRows([]);
      setSelectedBatch(null);
    } finally {
      setLoadingList(false);
    }
  }, [loadBatchDetail]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function handleSelectBatch(batchId: string) {
    setSelectedId(batchId);
    void loadBatchDetail(batchId);
  }

  const activeSummary = batches.find((batch) => batch.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sensor data"
        description="Temperature recordings synced from kiln sensors. Select a batch to view the time-series graph."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm uppercase tracking-wide text-gray-500">Batch recordings</h2>
          <button
            type="button"
            onClick={() => void loadBatches()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        <DataTable
          columns={TABLE_COLUMNS}
          rows={rows}
          loading={loadingList}
          emptyText="No sensor batches synced yet. Download batches from the mobile app first."
          selectedRowId={selectedId}
          onRowClick={(row) => handleSelectBatch(String(row.id))}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm uppercase tracking-wide text-gray-500">
              Temperature vs time
            </h2>
            {activeSummary ? (
              <p className="mt-1 text-sm text-gray-600">
                {activeSummary.batch_name}
                {activeSummary.kontikki_code ? ` · ${activeSummary.kontikki_code}` : ""}
                {" · "}
                Sensor {activeSummary.kiln_id}
              </p>
            ) : null}
          </div>
          {activeSummary ? (
            <Link
              href={`/network/kontikkis/${activeSummary.kontikki_id ?? ""}`}
              className={`text-sm text-brand-dark hover:underline ${
                activeSummary.kontikki_id ? "" : "pointer-events-none opacity-40"
              }`}
            >
              View kontikki
            </Link>
          ) : null}
        </div>

        {loadingDetail ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Loading temperature readings…
          </div>
        ) : selectedBatch ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Start (UTC)" value={new Date(selectedBatch.start_time_utc).toLocaleString()} />
              <MetricCard label="Duration" value={formatDuration(selectedBatch.duration_seconds)} />
              <MetricCard label="Readings" value={String(selectedBatch.readings.length)} />
              <MetricCard
                label="Location"
                value={`${selectedBatch.latitude.toFixed(4)}, ${selectedBatch.longitude.toFixed(4)}`}
              />
            </div>
            <TemperatureTimeChart readings={selectedBatch.readings} height={360} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
            Select a batch above to view its temperature graph.
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm Smedium text-gray-900">{value}</p>
    </div>
  );
}
