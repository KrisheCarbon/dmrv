"use client";

import Link from "next/link";
import TemperatureTimeChart from "@/components/charts/TemperatureTimeChart";
import type { KilnTemperatureReading } from "@/types";
import { formatDateTime, type PyrolysisSensorLog } from "./productionLib";

function heatLabel(log: PyrolysisSensorLog): string {
  if (log.stayed_at_or_above_350 == null || log.lowest_c == null) {
    return "No temperature points in this window.";
  }
  const low = `${log.lowest_c.toFixed(0)}°C`;
  const stretch = log.ends_excluded
    ? "Leaving out the first and last tenth of this window"
    : "Across this window";
  if (log.stayed_at_or_above_350) {
    return `${stretch}, the temperature stayed at or above 350°C. Lowest in that stretch: ${low}.`;
  }
  return `${stretch}, the temperature dropped below 350°C. Lowest in that stretch: ${low}.`;
}

export default function PyrolysisSensorLogs({
  logs,
}: {
  logs: PyrolysisSensorLog[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-neutral-950">Temperature log</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        Sensor recordings for this kontikki that overlap the time of this run.
      </p>

      {logs.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-900">
          No sensor log matches this kiln and this run&apos;s time.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="space-y-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  Module {log.kiln_id}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatDateTime(log.started_at)} – {formatDateTime(log.ended_at)}
                  {log.clock === "sensor"
                    ? " · GPS time from the sensor"
                    : " · Phone time. The sensor did not send GPS time."}
                </p>
                <p className="mt-1 text-sm text-neutral-900">{heatLabel(log)}</p>
                <p className="text-xs text-neutral-500">
                  {log.point_count.toLocaleString()} readings in this window
                  {log.readings.length < log.point_count
                    ? `, chart shows ${log.readings.length.toLocaleString()}`
                    : ""}
                  .{" "}
                  <Link href="/biochar/sensor-data" className="text-brand-dark hover:underline">
                    All sensor logs
                  </Link>
                </p>
              </div>
              <TemperatureTimeChart
                height={220}
                readings={log.readings as KilnTemperatureReading[]}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
