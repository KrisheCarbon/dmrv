"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TemperatureTimeChart from "@/components/charts/TemperatureTimeChart";
import { getKilnBatch, listKilnBatches } from "@/app/(admin)/network/sensor-data/actions";
import type { KilnBatchDetail, KilnBatchSummary } from "@/types";

export default function DashboardSensorData() {
  const [latestBatch, setLatestBatch] = useState<KilnBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const batches = await listKilnBatches();
      if (batches.length === 0) {
        setLatestBatch(null);
        return;
      }

      const latest = batches[0] as KilnBatchSummary;
      const detail = await getKilnBatch(latest.id);
      setLatestBatch(detail);
    } catch (err) {
      setLatestBatch(null);
      setError(err instanceof Error ? err.message : "Failed to load sensor data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm uppercase tracking-wide text-gray-500">Sensor data</h3>
          <p className="text-sm text-gray-600">
            Latest kiln temperature recording from synced sensor batches.
          </p>
        </div>
        <Link
          href="/network/sensor-data"
          className="inline-flex items-center justify-center rounded-lg border border-brand-dark/20 px-4 py-2 text-sm Smedium text-brand-dark hover:bg-brand-dark/5 transition"
        >
          View all sensor data
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading sensor graph…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : latestBatch ? (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base Smedium text-gray-900">{latestBatch.batch_name}</p>
              <p className="text-sm text-gray-500">
                {latestBatch.kontikki_code ? `${latestBatch.kontikki_code} · ` : ""}
                Sensor {latestBatch.kiln_id} · {latestBatch.readings.length} readings
              </p>
            </div>
            <p className="text-sm text-gray-500">
              {new Date(latestBatch.start_time_utc).toLocaleString()} UTC
            </p>
          </div>
          <TemperatureTimeChart readings={latestBatch.readings} height={280} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No sensor batches synced yet. Use the mobile app to download kiln recordings, then
          return here to view temperature graphs.
        </div>
      )}
    </section>
  );
}
