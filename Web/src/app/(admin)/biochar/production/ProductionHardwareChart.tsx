"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getKontikki } from "../../network/kontikkis/actions";
import { getProductionHardwareReadings, type SensorCoverage } from "../sensor-data/liveActions";
import { analyseTemperatureTrace, type SensorAnalysis } from "./sensorAnalysis";
import { readSensorAnalysis, storeSensorAnalysis } from "./sensorAnalysisStore";
import { SensorAnalysisTable } from "./SensorAnalysisView";
import { type PyrolysisBatchDetail } from "./productionLib";
import {
  hardwareChartSeries,
  hardwareImei,
  marksInsideWindow,
  openProductionPhoto,
  photoDots,
  photoInstantMs,
  productionPhotoMarks,
  productionSensorWindow,
  type ProductionPhotoMark,
} from "./productionHardware";

const AXIS = { fontSize: 12, fill: "var(--text-secondary)" };

function formatClock(value: number) {
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIndiaTime(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PhotoDot({
  cx,
  cy,
  payload,
  onPick,
}: {
  cx?: number;
  cy?: number;
  payload?: ProductionPhotoMark & { x: number; y: number };
  onPick: (mark: ProductionPhotoMark) => void;
}) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={payload.label}
      style={{ cursor: "pointer" }}
      onClick={(event) => {
        event.stopPropagation();
        onPick(payload);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(payload);
        }
      }}
    >
      <title>{payload.label}</title>
      <circle cx={cx} cy={cy} r={7} fill="var(--brand-dark)" stroke="var(--background)" strokeWidth={2} />
    </g>
  );
}

export default function ProductionHardwareChart({
  batch,
  compact = false,
}: {
  batch: PyrolysisBatchDetail;
  compact?: boolean;
}) {
  const marks = useMemo(() => productionPhotoMarks(batch), [batch]);
  const sensorWindow = useMemo(() => productionSensorWindow(marks), [marks]);
  const visibleMarks = useMemo(
    () => (sensorWindow ? marksInsideWindow(marks, sensorWindow) : []),
    [marks, sensorWindow],
  );
  const [showPhotos, setShowPhotos] = useState(false);
  const [analysis, setAnalysis] = useState<SensorAnalysis | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductionPhotoMark | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [coverage, setCoverage] = useState<SensorCoverage | null>(null);
  const [readings, setReadings] = useState<Array<{ received_at: string; payload: Record<string, unknown> }>>([]);
  const [hardwareId, setHardwareId] = useState<string | null>(batch.hardware_id?.trim() || null);
  const [hardwareReady, setHardwareReady] = useState(Boolean(batch.hardware_id?.trim()));

  useEffect(() => {
    const onBatch = batch.hardware_id?.trim();
    if (onBatch) {
      setHardwareId(onBatch);
      setHardwareReady(true);
      return;
    }
    let cancelled = false;
    setHardwareReady(false);
    void getKontikki(batch.kontikki_id)
      .then((kontikki) => {
        if (cancelled) return;
        setHardwareId(kontikki.module_id?.trim() || null);
        setHardwareReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHardwareId(null);
        setHardwareReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [batch.hardware_id, batch.kontikki_id]);

  useEffect(() => {
    let cancelled = false;
    void readSensorAnalysis(batch.id).then((saved) => {
      if (!cancelled && saved) {
        setAnalysis(saved);
        window.dispatchEvent(new CustomEvent("krishe-sensor-analysis", { detail: { batchId: batch.id } }));
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [batch.id]);

  async function openAnalysis() {
    setAnalysisOpen(true);
    if (analysis?.version === 2) return;
    setAnalysisBusy(true);
    setAnalysisError(null);
    try {
      const saved = await readSensorAnalysis(batch.id);
      const next =
        saved ??
        analyseTemperatureTrace(readings, {
          deviceId,
          windowFrom: sensorWindow?.from ?? null,
          windowTo: sensorWindow?.to ?? null,
        });
      if (!next) {
        setAnalysisError(
          loading
            ? "The curve is still loading."
            : "This curve does not have enough temperature readings to analyse.",
        );
        return;
      }
      const stored = saved ?? (await storeSensorAnalysis(batch.id, next));
      setAnalysis(stored);
      window.dispatchEvent(new CustomEvent("krishe-sensor-analysis", { detail: { batchId: batch.id } }));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "The analysis could not be saved.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  useEffect(() => {
    if (!hardwareId || !sensorWindow) {
      setReadings([]);
      setDeviceId(null);
      setError(null);
      setIncomplete(false);
      setCoverage(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getProductionHardwareReadings(hardwareId, sensorWindow.from, sensorWindow.to).then((result) => {
      if (cancelled) return;
      setDeviceId(result.device_id);
      setReadings(result.readings);
      setIncomplete(result.incomplete);
      setCoverage(result.coverage);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hardwareId, sensorWindow]);

  const model = useMemo(() => hardwareChartSeries(readings), [readings]);
  const dots = useMemo(() => {
    const primary = model.series[0]?.key;
    if (!primary) return [];
    return photoDots(visibleMarks, model.points, primary);
  }, [model, visibleMarks]);

  const height = compact ? 200 : 300;
  const kilnTimeKnown = marks.some((mark) => mark.role === "kiln");
  const imei = hardwareId ? hardwareImei(hardwareId) : null;

  const kilnMark = marks.find((mark) => mark.role === "kiln");
  const quenchMark = marks.reduce<ProductionPhotoMark | null>((latest, mark) => {
    if (mark.role !== "quench") return latest;
    if (!latest || photoInstantMs(mark.at) > photoInstantMs(latest.at)) return mark;
    return latest;
  }, null);
  const windowStart = kilnMark ?? marks[0];
  const windowEnd = quenchMark ?? marks[marks.length - 1];
  const windowLabel =
    windowStart && windowEnd
      ? `${formatIndiaTime(photoInstantMs(windowStart.at))} – ${formatIndiaTime(photoInstantMs(windowEnd.at))}`
      : null;
  const readingCount =
    !loading && readings.length > 0 ? ` ${readings.length.toLocaleString()} readings.` : "";
  let note = kilnTimeKnown
    ? `Temperature from the kiln photo until the quenching photo${windowLabel ? ` (${windowLabel})` : ""}.${readingCount}`
    : `Temperature from the first timestamped photo until the quenching photo${windowLabel ? ` (${windowLabel})` : ""}.${readingCount}`;
  if (!hardwareReady) {
    note = "Reading the IMEI from this kontikki’s hardware id.";
  } else if (!hardwareId) {
    note = "This kontikki has no hardware id, so its IMEI cannot be read.";
  } else if (!imei) {
    note = `Hardware ${hardwareId} does not contain an IMEI.`;
  } else if (!sensorWindow) {
    note = "This run has no kiln photo time and no quenching photo time, so the sensor window is unknown.";
  } else if (error) {
    note = error;
  } else if (!loading && !deviceId) {
    note = `No stored sensor uses IMEI ${imei}.`;
  } else if (!loading && deviceId && model.points.length === 0) {
    const span = kilnTimeKnown ? "the kiln photo and the quenching photo" : "the first timestamped photo and the quenching photo";
    const searched = windowLabel ? ` (${windowLabel})` : "";
    const stored =
      coverage?.stored_from && coverage.stored_to
        ? ` Stored readings for this IMEI run ${formatIndiaTime(Date.parse(coverage.stored_from))} – ${formatIndiaTime(Date.parse(coverage.stored_to))}.`
        : "";
    const returned =
      coverage && coverage.returned_count > 0 && coverage.returned_from && coverage.returned_to
        ? ` The latest reply only includes ${formatIndiaTime(Date.parse(coverage.returned_from))} – ${formatIndiaTime(Date.parse(coverage.returned_to))}.`
        : coverage && coverage.returned_count === 0
          ? " The sensor API returned no rows for this IMEI."
          : "";
    note = `No temperature readings between ${span}${searched}.${stored}${returned}`;
  }

  const canChart = Boolean(hardwareId && sensorWindow && !error && model.points.length > 0 && model.series.length > 0);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-950">Kiln sensor</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {deviceId && deviceId !== imei ? `${deviceId} · ` : ""}
            {imei ? `IMEI ${imei} · ` : ""}
            {note}
          </p>
          {incomplete ? (
            <p className="mt-1 text-xs text-text-secondary">
              The earliest stored reading in this reply is after the kiln photo, so the start of the curve may be missing.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openAnalysis()}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            Analysis
          </button>
          <button
            type="button"
            aria-pressed={showPhotos}
            onClick={() => {
              setShowPhotos((current) => !current);
              setSelected(null);
            }}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-50"
          >
            {showPhotos ? "Hide photo marks" : "Show photo marks"}
          </button>
        </div>
      </div>
      {analysisOpen ? (
        analysisBusy ? (
          <p className="mt-3 text-sm text-text-secondary">Saving the curve analysis…</p>
        ) : analysisError ? (
          <p className="mt-3 text-sm text-neutral-900">{analysisError}</p>
        ) : analysis ? (
          <SensorAnalysisTable analysis={analysis} />
        ) : null
      ) : null}

      {loading || !hardwareReady ? (
        <p className="mt-3 text-sm text-text-secondary">Loading sensor readings…</p>
      ) : canChart ? (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={model.points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={AXIS}
                tickFormatter={formatClock}
              />
              <YAxis
                tick={AXIS}
                width={48}
                label={{
                  value: "Temperature (°C)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--text-secondary)", fontSize: 12 },
                }}
              />
              <Tooltip
                formatter={(value, name) => [`${value ?? "—"} °C`, name]}
                labelFormatter={(value) =>
                  typeof value === "number" ? formatClock(value) : "Reading"
                }
              />
              <Legend />
              {model.series.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {showPhotos ? (
                <Scatter
                  data={dots}
                  dataKey="y"
                  name="Photos"
                  legendType="none"
                  isAnimationActive={false}
                  shape={(props: { cx?: number; cy?: number; payload?: ProductionPhotoMark & { x: number; y: number } }) => (
                    <PhotoDot {...props} onPick={setSelected} />
                  )}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
          {showPhotos && selected ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-brand-cream px-3 py-2">
              <div>
                <p className="text-sm font-medium text-neutral-950">{selected.label}</p>
                <p className="text-xs text-text-secondary">
                  {formatIndiaTime(photoInstantMs(selected.at))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openProductionPhoto(selected.anchor)}
                className="rounded-xl bg-brand-dark px-3 py-2 text-sm font-medium text-white"
              >
                View photo
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
