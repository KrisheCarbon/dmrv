"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getLiveSensorReadings,
  listLiveSensors,
  type LiveSensor,
  type SensorReadingDetail,
  type SensorReadingRow,
} from "./liveActions";

const POLL_MS = 5_000;
const SERIES_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#6d28d9", "#0369a1"];
const AXIS = { fontSize: 12, fill: "var(--text-secondary)" };

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function flatten(payload: Record<string, unknown> | null | undefined) {
  const flat: Record<string, string> = {};
  if (!payload) return flat;
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        flat[`${key}.${inner}`] = displayValue(innerValue);
      }
    } else {
      flat[key] = displayValue(value);
    }
  }
  return flat;
}

function displayValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function readingFields(reading: SensorReadingRow): Record<string, string> {
  return {
    received_at: formatWhen(reading.received_at),
    id: reading.id,
    device_id: reading.device_id ?? "",
    idempotency_key: reading.idempotency_key ?? "",
    ...flatten(reading.payload),
  };
}

function chartNumber(value: string) {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function seriesKeys(rows: SensorReadingRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(flatten(row.payload))) {
      if (chartNumber(value) == null) continue;
      if (/time|epoch|imei|id$|sid|lat|lon|gps|addr/i.test(key)) continue;
      keys.add(key);
    }
  }
  const all = [...keys];
  const preferred = all.filter((key) => /t1|t2|temp|humidity|pressure/i.test(key));
  return preferred.length > 0 ? preferred : all;
}

export default function LiveSensors() {
  const [sensors, setSensors] = useState<LiveSensor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SensorReadingDetail | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSensors() {
      try {
        const data = await listLiveSensors();
        if (cancelled) return;
        setSensors(data.sensors);
        setError(data.error);
        setSelectedId((current) => {
          if (current && data.sensors.some((sensor) => sensor.device_id === current)) return current;
          return data.sensors[0]?.device_id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sensors");
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    void loadSensors();
    const timer = setInterval(() => void loadSensors(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);

    async function loadReadings() {
      try {
        const data = await getLiveSensorReadings(selectedId as string);
        if (cancelled) return;
        setDetail(data);
        setError(data.error);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load readings");
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    void loadReadings();
    const timer = setInterval(() => void loadReadings(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedId]);

  const readings = detail?.readings ?? [];
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const reading of readings) {
      for (const key of Object.keys(readingFields(reading))) keys.add(key);
    }
    const preferred = ["received_at", "id", "device_id", "idempotency_key"];
    return [
      ...preferred.filter((key) => keys.has(key)),
      ...[...keys].filter((key) => !preferred.includes(key)).sort(),
    ];
  }, [readings]);

  const graph = useMemo(() => {
    const keys = seriesKeys(readings);
    const points = readings.map((reading) => {
      const flat = flatten(reading.payload);
      const point: Record<string, string | number | null> = {
        label: formatClock(reading.received_at),
      };
      for (const key of keys) point[key] = chartNumber(flat[key] ?? "");
      return point;
    });
    return { keys, points };
  }, [readings]);

  const selected = sensors.find((sensor) => sensor.device_id === selectedId) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wide text-gray-500">Live sensors</h2>
          <p className="mt-1 text-sm text-gray-600">
            Updates every 5 seconds. A sensor is live when a reading arrived in the last 30 seconds.
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={() => setShowGraph((current) => !current)}
            className="rounded-lg border border-brand-dark px-3 py-1.5 text-sm text-brand-dark"
          >
            {showGraph ? "Hide graph" : "Visualize"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {loadingList ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
              Loading sensors…
            </div>
          ) : sensors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {error ? "Sensor readings could not be loaded." : "No sensor readings stored yet."}
            </div>
          ) : (
            sensors.map((sensor) => {
              const id = sensor.device_id ?? "";
              const active = id === selectedId;
              return (
                <button
                  key={id || "unknown"}
                  type="button"
                  onClick={() => setSelectedId(id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left ${
                    active ? "border-brand-dark bg-white" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{id || "Unknown sensor"}</span>
                    <StatusPill live={sensor.live} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{sensor.reading_count} readings</p>
                  <p className="text-xs text-gray-500">Last {formatWhen(sensor.last_at)}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Select a sensor to see its readings.
            </div>
          ) : loadingDetail && detail?.device_id !== selectedId ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Loading readings…
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Sensor" value={selected.device_id || "Unknown"} />
                <Metric label="Status" value={selected.live ? "Live" : "Offline"} />
                <Metric label="Readings" value={String(detail?.total ?? selected.reading_count)} />
                <Metric label="Last received" value={formatWhen(selected.last_at)} />
              </div>

              {showGraph ? (
                graph.keys.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                    These readings have no numeric series to graph. The raw values are in the table.
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={graph.points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={AXIS} minTickGap={24} />
                        <YAxis tick={AXIS} width={56} />
                        <Tooltip />
                        <Legend />
                        {graph.keys.map((key, index) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={key}
                            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                            strokeWidth={2}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              ) : null}

              <div className="max-h-[32rem] overflow-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-gray-500" colSpan={Math.max(columns.length, 1)}>
                          No readings for this sensor.
                        </td>
                      </tr>
                    ) : (
                      [...readings].reverse().map((reading) => {
                        const fields = readingFields(reading);
                        return (
                          <tr key={reading.id} className="border-t border-gray-100">
                            {columns.map((column) => (
                              <td key={column} className="whitespace-nowrap px-3 py-2 text-gray-800">
                                {fields[column] || "—"}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {detail && detail.total > readings.length ? (
                <p className="text-xs text-gray-500">
                  Showing the latest {readings.length} of {detail.total} readings.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
        live ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-gray-400"}`} />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm text-gray-900">{value}</p>
    </div>
  );
}
