import {
  PYROLYSIS_BATCH_STATUS_PHOTO_KEYS,
  pyrolysisBatchStatusPhotoLabel,
  type PyrolysisBatchStatusPhotoKey,
} from "@krishecarbon/shared";
import { batchPhotoUrl, type PyrolysisBatchDetail } from "./productionLib";

export interface ProductionPhotoMark {
  id: string;
  anchor: string;
  label: string;
  at: string;
  role: "kiln" | "quench" | "process";
}

export interface HardwareReading {
  received_at: string;
  payload: Record<string, unknown>;
}

export interface HardwareSeries {
  key: string;
  label: string;
  color: string;
}

export interface HardwareChartPoint {
  x: number;
  [key: string]: number | null;
}

const SERIES_COLORS = [
  "var(--series-top)",
  "var(--brand-green)",
  "var(--series-middle)",
  "var(--series-bottom)",
];

function instant(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

/**
 * Photo capture fields store India wall time with a Z suffix
 * (`getCurrentIST`: trusted UTC plus 5.5 hours, then `toISOString`).
 * Sensor `received_at` is a real UTC instant. Subtract the offset before
 * comparing the two.
 */
const IST_STORED_AS_UTC_MS = 5.5 * 60 * 60 * 1000;

export function photoInstantMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed - IST_STORED_AS_UTC_MS;
}

const SAMPLE_TIME_KEY = /^(time|ts|timestamp|recorded_at|sampled_at|utc|datetime)$/i;

function clockMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e12 && value < 2e13) return value;
    if (value > 1e9 && value < 2e10) return value * 1000;
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return clockMs(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function payloadSampleMs(payload: unknown, key: string | null, depth: number): number | null {
  if (depth > 5 || payload == null) return null;
  if (key && SAMPLE_TIME_KEY.test(key)) {
    const ms = clockMs(payload);
    if (ms != null) return ms;
  }
  if (typeof payload === "object" && !Array.isArray(payload)) {
    for (const [childKey, child] of Object.entries(payload as Record<string, unknown>)) {
      const found = payloadSampleMs(child, childKey, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

/**
 * Server arrival, unless the payload's own clock agrees with it within 10 minutes.
 * A sample time hours away is left unused so it cannot move the point out of the photo window.
 */
export function readingInstantMs(reading: HardwareReading): number {
  const received = Date.parse(reading.received_at);
  const sample = payloadSampleMs(reading.payload, null, 0);
  if (sample == null || !Number.isFinite(received)) return sample ?? received;
  if (Math.abs(sample - received) < 10 * 60 * 1000) return sample;
  if (Math.abs(sample - IST_STORED_AS_UTC_MS - received) < 10 * 60 * 1000) {
    return sample - IST_STORED_AS_UTC_MS;
  }
  return received;
}

function capturedAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  return instant((metadata as { captured_at?: unknown }).captured_at);
}

function photoCapturedAt(
  batch: PyrolysisBatchDetail,
  key: PyrolysisBatchStatusPhotoKey,
): string | null {
  if (key === "feedstock_photo") return capturedAt(batch.feedstock_photo_metadata);
  if (key === "feedstock_size_photo") return capturedAt(batch.feedstock_size_photo_metadata);
  if (key.startsWith("moisture_photo_")) {
    const slot = key.slice("moisture_photo_".length);
    return capturedAt(batch[`moisture_photo_metadata_${slot}` as keyof PyrolysisBatchDetail]);
  }
  if (key.startsWith("stage_")) {
    const stage = key.slice("stage_".length);
    const column = batch[`stage_${stage}_captured_at` as keyof PyrolysisBatchDetail];
    return instant(column) ?? capturedAt(batch[`stage_${stage}_photo_metadata` as keyof PyrolysisBatchDetail]);
  }
  return null;
}

function pushMark(marks: ProductionPhotoMark[], mark: ProductionPhotoMark | null) {
  if (!mark || !instant(mark.at)) return;
  if (marks.some((item) => item.anchor === mark.anchor)) return;
  marks.push(mark);
}

export function productionPhotoMarks(batch: PyrolysisBatchDetail): ProductionPhotoMark[] {
  const marks: ProductionPhotoMark[] = [];
  const kilnAt =
    batch.kiln_photo_captured_at ??
    capturedAt((batch as { kiln_photo_metadata?: unknown }).kiln_photo_metadata);
  if (batch.kiln_photo_url && kilnAt) {
    pushMark(marks, {
      id: "kiln",
      anchor: "kiln",
      label: "Kiln photo",
      at: kilnAt,
      role: "kiln",
    });
  }

  const sharedKeys =
    batch.protocol === "rainbow"
      ? (["feedstock_photo", "feedstock_size_photo"] as const)
      : PYROLYSIS_BATCH_STATUS_PHOTO_KEYS;

  for (const key of sharedKeys) {
    const at = photoCapturedAt(batch, key);
    if (!at || !batchPhotoUrl(batch, key)) continue;
    pushMark(marks, {
      id: key,
      anchor: key,
      label: pyrolysisBatchStatusPhotoLabel(key),
      at,
      role: key === "stage_quenching" ? "quench" : "process",
    });
  }

  const proof = batch.run_proof;
  if (proof) {
    for (const reading of proof.moisture) {
      if (!reading.captured_at || !reading.photo_url) continue;
      const percent = reading.reading != null ? `, ${reading.reading}%` : "";
      pushMark(marks, {
        id: `moisture-${reading.slot}`,
        anchor: `moisture-${reading.slot}`,
        label: `Moisture ${reading.slot}${percent}`,
        at: reading.captured_at,
        role: "process",
      });
    }
    for (const layer of proof.layers) {
      if (!layer.captured_at || !layer.photo_url) continue;
      pushMark(marks, {
        id: `layer-${layer.sequence}`,
        anchor: `layer-${layer.sequence}`,
        label: `Layer ${layer.sequence} feedstock`,
        at: layer.captured_at,
        role: "process",
      });
    }
    if (proof.flame_curtain_captured_at && proof.flame_curtain_photo_url) {
      pushMark(marks, {
        id: "flame-curtain",
        anchor: "flame-curtain",
        label: "Flame curtain",
        at: proof.flame_curtain_captured_at,
        role: "process",
      });
    }
    const quenchPhotos = proof.quench_photos ?? [];
    if (quenchPhotos.length > 0) {
      quenchPhotos.forEach((photo, index) => {
        if (!photo.captured_at || !photo.photo_url) return;
        const last = index === quenchPhotos.length - 1;
        const label =
          index === 0
            ? "Quenching start"
            : last
              ? "Quenching end"
              : `Quenching photo ${photo.slot}`;
        pushMark(marks, {
          id: `quench-${photo.slot}`,
          anchor: `quench-${photo.slot}`,
          label,
          at: photo.captured_at,
          role: "quench",
        });
      });
    } else {
      if (proof.quench_start_captured_at && proof.quench_start_photo_url) {
        pushMark(marks, {
          id: "quench-start",
          anchor: "quench-start",
          label: "Quenching start",
          at: proof.quench_start_captured_at,
          role: "quench",
        });
      }
      if (proof.quench_end_captured_at && proof.quench_end_photo_url) {
        pushMark(marks, {
          id: "quench-end",
          anchor: "quench-end",
          label: "Quenching end",
          at: proof.quench_end_captured_at,
          role: "quench",
        });
      }
    }
    if (
      !marks.some((mark) => mark.role === "quench") &&
      proof.quench_video_captured_at &&
      proof.quench_video_url
    ) {
      pushMark(marks, {
        id: "quench-video",
        anchor: "quench-video",
        label: "Quenching video",
        at: proof.quench_video_captured_at,
        role: "quench",
      });
    }
  }

  return marks.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Kiln photo through the last quenching photo, as real UTC instants. */
export function productionSensorWindow(
  marks: ProductionPhotoMark[],
): { from: string; to: string } | null {
  if (marks.length === 0) return null;
  const kiln = marks.find((mark) => mark.role === "kiln");
  const quench = marks.reduce<ProductionPhotoMark | null>((latest, mark) => {
    if (mark.role !== "quench") return latest;
    if (!latest || photoInstantMs(mark.at) > photoInstantMs(latest.at)) return mark;
    return latest;
  }, null);
  const from = kiln?.at ?? marks[0].at;
  const to = quench?.at ?? marks[marks.length - 1].at;
  let fromMs = photoInstantMs(from);
  let toMs = photoInstantMs(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (toMs < fromMs) {
    const swap = fromMs;
    fromMs = toMs;
    toMs = swap;
  }
  // Capture and the sensor clock can disagree by a few minutes.
  fromMs -= 3 * 60 * 1000;
  toMs += 3 * 60 * 1000;
  if (toMs === fromMs) toMs += 60_000;
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

export function marksInsideWindow(
  marks: ProductionPhotoMark[],
  window: { from: string; to: string },
): ProductionPhotoMark[] {
  const start = Date.parse(window.from);
  const end = Date.parse(window.to);
  return marks.filter((mark) => {
    const at = photoInstantMs(mark.at);
    return Number.isFinite(at) && at >= start && at <= end;
  });
}

/** Hardware id `krishe-kiln-01` is the kiln name. Its sensor device id is this IMEI. */
const HARDWARE_IMEI: Record<string, string> = {
  "krishe-kiln-01": "862288084397726",
};

/** Sensor readings are stored under the IMEI, not under the hardware name. */
export function hardwareImei(hardwareId: string): string | null {
  const trimmed = hardwareId.trim();
  if (!trimmed) return null;
  const embedded = trimmed.match(/\d{14,17}/g);
  if (embedded) return embedded[embedded.length - 1];
  return HARDWARE_IMEI[trimmed.toLowerCase()] ?? null;
}

/** The device id to request is the IMEI itself. */
export function matchHardwareDevice(
  hardwareId: string,
  deviceIds: Array<string | null | undefined>,
): string | null {
  const imei = hardwareImei(hardwareId);
  const ids = deviceIds.filter((id): id is string => Boolean(id?.trim()));
  const wanted = hardwareId.trim().toLowerCase();
  const exactName = ids.find((id) => id.trim().toLowerCase() === wanted);
  if (exactName) return exactName;
  if (imei) {
    const exactImei = ids.find((id) => id.trim() === imei);
    if (exactImei) return exactImei;
  }
  const contained = ids
    .filter((id) => wanted.includes(id.trim().toLowerCase()) && id.trim().length >= 4)
    .sort((a, b) => b.trim().length - a.trim().length)[0];
  if (contained) return contained;
  return imei;
}

function flatten(payload: Record<string, unknown>, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flatten(value as Record<string, unknown>, name));
    } else if (value != null && typeof value !== "object") {
      flat[name] = String(value);
    }
  }
  return flat;
}

function chartNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function temperatureLike(key: string): boolean {
  return /t1$|t2$|t3$|temp/i.test(key);
}

function usableReading(key: string, value: number): boolean {
  if (temperatureLike(key) && (value < -40 || value > 1300)) return false;
  return true;
}

export function seriesLabel(key: string): string {
  const bare = key.split(".").pop() ?? key;
  if (/^t1$/i.test(bare)) return "Probe 1";
  if (/^t2$/i.test(bare)) return "Probe 2";
  if (/^t3$/i.test(bare)) return "Probe 3";
  if (/temp/i.test(bare)) return "Temperature";
  return bare.replaceAll("_", " ");
}

export function hardwareChartSeries(readings: HardwareReading[]): {
  series: HardwareSeries[];
  points: HardwareChartPoint[];
} {
  const rows = readings
    .map((reading) => ({
      x: readingInstantMs(reading),
      flat: flatten(reading.payload),
    }))
    .filter((row) => Number.isFinite(row.x))
    .sort((a, b) => a.x - b.x);

  const keys = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.flat)) {
      if (/time|epoch|imei|id$|sid|lat|lon|gps|addr/i.test(key)) continue;
      const number = chartNumber(value);
      if (number == null || !usableReading(key, number)) continue;
      keys.add(key);
    }
  }
  const all = [...keys];
  const preferred = all.filter((key) => temperatureLike(key));
  const chosen = (preferred.length > 0 ? preferred : all).slice(0, 4);
  const series = chosen.map((key, index) => ({
    key,
    label: seriesLabel(key),
    color: SERIES_COLORS[index] ?? SERIES_COLORS[0],
  }));

  const points = rows.flatMap((row) => {
    const point: HardwareChartPoint = { x: row.x };
    let hasTemperature = false;
    for (const key of chosen) {
      const number = chartNumber(row.flat[key] ?? "");
      const usable = number != null && usableReading(key, number);
      point[key] = usable ? number : null;
      if (usable) hasTemperature = true;
    }
    return hasTemperature ? [point] : [];
  });

  return { series, points };
}

export function photoDots(
  marks: ProductionPhotoMark[],
  points: HardwareChartPoint[],
  primaryKey: string,
): Array<ProductionPhotoMark & { x: number; y: number }> {
  return marks.flatMap((mark) => {
    const x = photoInstantMs(mark.at);
    if (!Number.isFinite(x)) return [];
    let nearest: HardwareChartPoint | null = null;
    let best = Infinity;
    for (const point of points) {
      const value = point[primaryKey];
      if (typeof value !== "number") continue;
      const gap = Math.abs(point.x - x);
      if (gap < best) {
        best = gap;
        nearest = point;
      }
    }
    const y = nearest?.[primaryKey];
    if (typeof y !== "number") return [];
    return [{ ...mark, x, y }];
  });
}

export function openProductionPhoto(anchor: string) {
  const node = document.getElementById(`production-photo-${anchor}`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.style.outline = "2px solid var(--brand-dark)";
  node.style.outlineOffset = "2px";
  window.setTimeout(() => {
    node.style.outline = "";
    node.style.outlineOffset = "";
  }, 2400);
}
