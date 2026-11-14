"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
const TABLE_PAGE = 100;
const CHART_POINTS = 1500;
const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SERIES_COLORS = [
  "var(--series-top)",
  "var(--series-middle)",
  "var(--series-bottom)",
  "var(--brand-dark)",
  "var(--status-success)",
];
const AXIS = { fontSize: 12, fill: "var(--text-secondary)" };

type AppliedRange = {
  key: string;
  from: string;
  to: string;
  followLive: boolean;
  readingCount?: number;
};

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { timeZone: IST });
}

function formatClock(value: string, spanMs: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (spanMs > 24 * 60 * 60 * 1000) {
    return date.toLocaleString("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toDatetimeLocal(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const ist = new Date(ms + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const hour = String(ist.getUTCHours()).padStart(2, "0");
  const minute = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDatetimeLocal(value: string, endOfMinute: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  ) - IST_OFFSET_MS + (endOfMinute ? 59_999 : 0);
  if (!Number.isFinite(utc)) return null;
  return new Date(utc).toISOString();
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

function estimatedCount(sensor: LiveSensor, from: string, to: string) {
  const storedStart = Date.parse(sensor.first_at);
  const storedEnd = Math.max(storedStart, Date.parse(sensor.last_at));
  const span = storedEnd - storedStart;
  const requested = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(span) || span < 60_000 || !Number.isFinite(requested) || requested <= 0) {
    return sensor.reading_count;
  }
  return Math.max(1, Math.ceil(sensor.reading_count * Math.min(1, requested / span)));
}

function sampleReadings(rows: SensorReadingRow[], maxPoints: number) {
  if (rows.length <= maxPoints) return rows;
  const last = rows.length - 1;
  const seen = new Set<number>();
  const indexes: number[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round((i * last) / (maxPoints - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    indexes.push(index);
  }
  return indexes.map((index) => rows[index]);
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export default function LiveSensors() {
  const [sensors, setSensors] = useState<LiveSensor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SensorReadingDetail | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedRange | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [showGraph, setShowGraph] = useState(true);
  const [page, setPage] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const sensorsRef = useRef(sensors);
  const latestRef = useRef<string | null>(null);
  sensorsRef.current = sensors;

  useEffect(() => {
    let cancelled = false;

    async function loadSensors() {
      try {
        const data = await listLiveSensors();
        if (cancelled) return;
        setSensors(data.sensors);
        if (data.error) setError(data.error);
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
    const sensor = sensorsRef.current.find((item) => item.device_id === selectedId);
    if (!selectedId || !sensor?.first_at) return;
    const to = new Date().toISOString();
    setFromInput(toDatetimeLocal(sensor.first_at));
    setToInput(toDatetimeLocal(to));
    setPage(0);
    setDetail(null);
    setLoadedKey(null);
    latestRef.current = null;
    setApplied({
      key: `${selectedId}|all|${sensor.first_at}`,
      from: sensor.first_at,
      to,
      followLive: true,
      readingCount: estimatedCount(sensor, sensor.first_at, to),
    });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !applied) {
      setDetail(null);
      return;
    }
    const deviceId = selectedId;
    let cancelled = false;
    let acceptAppend = false;
    const requestKey = applied.key;

    async function load(mode: "replace" | "append") {
      if (mode === "append" && !acceptAppend) return;
      if (mode === "replace") setLoadingDetail(true);
      const from = mode === "append" && latestRef.current
        ? new Date(Date.parse(latestRef.current) - 1000).toISOString()
        : applied!.from;
      const to = applied!.followLive ? new Date().toISOString() : applied!.to;
      try {
        const data = await getLiveSensorReadings(deviceId, {
          from,
          to,
          readingCount: mode === "replace" ? applied!.readingCount : undefined,
        });
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          if (mode === "replace") {
            setDetail({ device_id: deviceId, total: 0, readings: [] });
            setLoadedKey(requestKey);
          }
          return;
        }
        setDetail((current) => {
          const base = mode === "append" && current ? current.readings : [];
          const seen = new Set(base.map((reading) => reading.id));
          const readings = [...base];
          for (const reading of data.readings) {
            if (seen.has(reading.id)) continue;
            seen.add(reading.id);
            readings.push(reading);
          }
          readings.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at) || a.id.localeCompare(b.id));
          const newest = readings[readings.length - 1]?.received_at ?? null;
          if (newest) latestRef.current = newest;
          return {
            device_id: data.device_id || deviceId,
            total: readings.length,
            readings,
          };
        });
        acceptAppend = true;
        setLoadedKey(requestKey);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load readings");
        }
      } finally {
        if (!cancelled && mode === "replace") setLoadingDetail(false);
      }
    }

    void load("replace");
    const timer = applied.followLive ? setInterval(() => void load("append"), POLL_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [selectedId, applied]);

  const ready = Boolean(detail && loadedKey && applied && loadedKey === applied.key);
  const readings = ready ? detail!.readings : [];
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

  const spanMs = applied ? Math.max(0, Date.parse(applied.to) - Date.parse(applied.from)) : 0;
  const chartRows = useMemo(() => sampleReadings(readings, CHART_POINTS), [readings]);
  const graph = useMemo(() => {
    const keys = seriesKeys(readings);
    const points = chartRows.map((reading) => {
      const flat = flatten(reading.payload);
      const point: Record<string, string | number | null> = {
        label: formatClock(reading.received_at, spanMs),
      };
      for (const key of keys) point[key] = chartNumber(flat[key] ?? "");
      return point;
    });
    return { keys, points };
  }, [readings, chartRows, spanMs]);

  const newestFirst = useMemo(() => [...readings].reverse(), [readings]);
  const pageCount = Math.max(1, Math.ceil(newestFirst.length / TABLE_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = newestFirst.slice(safePage * TABLE_PAGE, (safePage + 1) * TABLE_PAGE);
  const selected = sensors.find((sensor) => sensor.device_id === selectedId) ?? null;

  function applyRange(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedId) return;
    const from = fromDatetimeLocal(fromInput, false);
    const to = fromDatetimeLocal(toInput, true);
    if (!from || !to) {
      setFormError("Choose a start and an end.");
      return;
    }
    if (Date.parse(from) > Date.parse(to)) {
      setFormError("The start must be before the end.");
      return;
    }
    setFormError(null);
    setPage(0);
    setDetail(null);
    setLoadedKey(null);
    latestRef.current = null;
    setApplied({
      key: `${selectedId}|${from}|${to}`,
      from,
      to,
      followLive: false,
      readingCount: selected ? estimatedCount(selected, from, to) : undefined,
    });
  }

  function showAllStored() {
    if (!selected?.first_at || !selectedId) return;
    const to = new Date().toISOString();
    setFromInput(toDatetimeLocal(selected.first_at));
    setToInput(toDatetimeLocal(to));
    setFormError(null);
    setPage(0);
    setDetail(null);
    setLoadedKey(null);
    latestRef.current = null;
    setApplied({
      key: `${selectedId}|all|${selected.first_at}|${to}`,
      from: selected.first_at,
      to,
      followLive: true,
      readingCount: estimatedCount(selected, selected.first_at, to),
    });
  }

  function applyPreset(minutes: number) {
    if (!selectedId) return;
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    setFromInput(toDatetimeLocal(from.toISOString()));
    setToInput(toDatetimeLocal(to.toISOString()));
    setFormError(null);
    setPage(0);
    setDetail(null);
    setLoadedKey(null);
    latestRef.current = null;
    setApplied({
      key: `${selectedId}|preset|${minutes}|${to.toISOString()}`,
      from: from.toISOString(),
      to: to.toISOString(),
      followLive: false,
      readingCount: selected ? estimatedCount(selected, from.toISOString(), to.toISOString()) : undefined,
    });
  }

  function exportCsv() {
    if (!selected || readings.length === 0) return;
    const header = columns.length > 0 ? columns : ["received_at"];
    const lines = readings.map((reading) => {
      const fields = readingFields(reading);
      return header.map((column) => csvCell(fields[column] ?? "")).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.device_id || "sensor"}-readings.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wide text-text-secondary">Live sensors</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Pick a sensor, then a date and time. The graph and table show every reading in that range.
            A sensor is live when a reading arrived in the last 30 seconds.
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={() => setShowGraph((current) => !current)}
            className="min-h-12 rounded-xl border border-brand-dark px-4 text-sm text-brand-dark"
          >
            {showGraph ? "Hide graph" : "Visualize"}
          </button>
        ) : null}
      </div>

      {error || formError ? (
        <div className="rounded-xl border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error">
          {formError || error}
        </div>
      ) : null}

      <form
        onSubmit={applyRange}
        className="space-y-4 rounded-2xl border border-border bg-white p-4"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="flex flex-col gap-2.5">
            <span className="text-xs font-medium text-text-secondary">From</span>
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-2.5">
            <span className="text-xs font-medium text-text-secondary">To</span>
            <input
              type="datetime-local"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              className="min-h-12 rounded-xl bg-brand-dark px-4 text-sm text-white"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={showAllStored}
              className="min-h-12 rounded-xl border border-brand-dark px-4 text-sm text-brand-dark"
            >
              All stored data
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset(60)}
            className="min-h-12 rounded-xl border border-border px-4 text-sm text-brand-dark"
          >
            Last hour
          </button>
          <button
            type="button"
            onClick={() => applyPreset(24 * 60)}
            className="min-h-12 rounded-xl border border-border px-4 text-sm text-brand-dark"
          >
            Last 24 hours
          </button>
          <p className="self-center text-xs text-text-secondary">
            Times are India Standard Time. All stored data keeps adding new readings.
          </p>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2.5">
          {loadingList ? (
            <div className="rounded-2xl border border-border bg-white p-4 text-sm text-text-secondary">
              Loading sensors…
            </div>
          ) : sensors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-brand-surface p-4 text-sm text-text-secondary">
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
                  className={`min-h-12 w-full rounded-xl border px-3 py-3 text-left ${
                    active ? "border-brand-dark bg-white" : "border-border bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="truncate text-sm font-medium text-foreground">{id || "Unknown sensor"}</span>
                    <StatusPill live={sensor.live} />
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">{sensor.reading_count} stored readings</p>
                  <p className="text-xs text-text-secondary">From {formatWhen(sensor.first_at)}</p>
                  <p className="text-xs text-text-secondary">Last {formatWhen(sensor.last_at)}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-border bg-brand-surface p-8 text-center text-sm text-text-secondary">
              Select a sensor to see its readings.
            </div>
          ) : !ready ? (
            <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-text-secondary">
              {loadingDetail ? "Loading readings for this time range…" : "Choose a time range and apply it."}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Sensor" value={selected.device_id || "Unknown"} />
                <Metric label="Status" value={selected.live ? "Live" : "Offline"} />
                <Metric label="Readings in range" value={String(readings.length)} />
                <Metric label="Stored in total" value={String(selected.reading_count)} />
              </div>
              <p className="text-sm text-text-secondary">
                {formatWhen(applied?.from)} to {formatWhen(applied?.followLive ? latestRef.current ?? applied.to : applied?.to)}
                {applied?.followLive ? " · including new readings" : ""}
              </p>

              {showGraph ? (
                graph.keys.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-brand-surface p-8 text-center text-sm text-text-secondary">
                    These readings have no numeric series to graph. The raw values are in the table.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-white p-4">
                    {chartRows.length < readings.length ? (
                      <p className="mb-2 text-xs text-text-secondary">
                        Graph plots {chartRows.length.toLocaleString("en-IN")} evenly spaced points from{" "}
                        {readings.length.toLocaleString("en-IN")} readings. The table lists every reading.
                      </p>
                    ) : null}
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

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <p className="text-sm text-text-secondary">
                  {readings.length === 0
                    ? "No readings in this range."
                    : `Rows ${safePage * TABLE_PAGE + 1}–${Math.min((safePage + 1) * TABLE_PAGE, newestFirst.length)} of ${newestFirst.length}`}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={exportCsv}
                    disabled={readings.length === 0}
                    className="min-h-12 rounded-xl border border-brand-dark px-4 text-sm text-brand-dark disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={safePage === 0}
                    className="min-h-12 rounded-xl border border-border px-4 text-sm text-brand-dark disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="min-h-12 rounded-xl border border-border px-4 text-sm text-brand-dark disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="max-h-[32rem] overflow-auto rounded-2xl border border-border bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-brand-surface text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-text-secondary" colSpan={Math.max(columns.length, 1)}>
                          No readings for this sensor in the selected time.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((reading) => {
                        const fields = readingFields(reading);
                        return (
                          <tr key={reading.id} className="border-t border-border">
                            {columns.map((column) => (
                              <td key={column} className="whitespace-nowrap px-3 py-2 text-foreground">
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
        live ? "bg-status-success-bg text-status-success" : "bg-brand-surface text-text-secondary"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-status-success" : "bg-brand-grey"}`} />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-1 truncate text-sm text-foreground">{value}</p>
    </div>
  );
}
