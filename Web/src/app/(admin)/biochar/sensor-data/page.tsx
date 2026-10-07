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
        description="Temperature recordings synced from kiln sensors. KriSHE Carbon nodes include top, middle, and bottom zones. A recording also appears on the production batch when the kiln and the time match that run."
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
          emptyText="No sensor batches synced yet. Connect a kiln sensor in the mobile app and save a recording."
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
            <button
              type="button"
              className="rounded-xl border border-brand-dark px-4 py-2 text-sm text-brand-dark"
              onClick={() => downloadReadingsCsv(selectedBatch)}
            >
              Export CSV
            </button>
            <TelemetryDetails readings={selectedBatch.readings} />
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

function downloadReadingsCsv(batch: KilnBatchDetail) {
  const header = [
    "time_offset_seconds",
    "kiln_state",
    "temperature",
    "top_c",
    "middle_c",
    "bottom_c",
    "top_valid",
    "middle_valid",
    "bottom_valid",
    "top_open",
    "middle_open",
    "bottom_open",
    "top_rate",
    "middle_rate",
    "bottom_rate",
    "latitude",
    "longitude",
    "satellites",
    "utc_epoch",
    "uptime_s",
    "recorded_at",
  ];
  const lines = batch.readings.map((reading) =>
    header
      .map((key) => {
        const value = reading[key as keyof typeof reading];
        if (value == null) return "";
        const text = String(value);
        return text.includes(",") ? `"${text}"` : text;
      })
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${batch.batch_name}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm Smedium text-gray-900">{value}</p>
    </div>
  );
}

function TelemetryDetails({ readings }: { readings: KilnBatchDetail["readings"] }) {
  const latest = readings[readings.length - 1];
  if (!latest || latest.kiln_state == null && latest.top_rate == null && latest.satellites == null) {
    return null;
  }

  const probe = (
    label: string,
    open: boolean | null | undefined,
    valid: boolean | null | undefined,
    temp: number | null | undefined,
    rate: number | null | undefined,
  ) => {
    if (open) return `${label}: probe open`;
    if (valid === false || temp == null) return `${label}: no reading`;
    const rateText = typeof rate === "number" ? ` · ${rate.toFixed(1)} °C/s` : "";
    return `${label}: ${temp.toFixed(1)} °C${rateText}`;
  };

  const gnssTime =
    typeof latest.utc_epoch === "number" && latest.utc_epoch > 1_000_000_000
      ? new Date(latest.utc_epoch > 1e12 ? latest.utc_epoch : latest.utc_epoch * 1000).toLocaleString()
      : "No GNSS time";
  const hasFix =
    typeof latest.latitude === "number" &&
    typeof latest.longitude === "number" &&
    (latest.latitude !== 0 || latest.longitude !== 0);

  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wide text-gray-500">Latest module reading</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Kiln state" value={latest.kiln_state ?? "—"} />
        <MetricCard label="Satellites" value={latest.satellites != null ? String(latest.satellites) : "—"} />
        <MetricCard label="Module uptime" value={latest.uptime_s != null ? `${latest.uptime_s} s` : "—"} />
        <MetricCard label="GNSS time" value={gnssTime} />
        <MetricCard
          label="Top"
          value={probe("Top", latest.top_open, latest.top_valid, latest.top_c, latest.top_rate).replace(/^Top: /, "")}
        />
        <MetricCard
          label="Middle"
          value={probe("Middle", latest.middle_open, latest.middle_valid, latest.middle_c, latest.middle_rate).replace(/^Middle: /, "")}
        />
        <MetricCard
          label="Bottom"
          value={probe("Bottom", latest.bottom_open, latest.bottom_valid, latest.bottom_c, latest.bottom_rate).replace(/^Bottom: /, "")}
        />
        <MetricCard
          label="Reading location"
          value={hasFix ? `${latest.latitude!.toFixed(5)}, ${latest.longitude!.toFixed(5)}` : "No GNSS fix"}
        />
      </div>
    </section>
  );
}
