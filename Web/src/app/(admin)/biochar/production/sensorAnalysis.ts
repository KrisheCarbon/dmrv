import type { HardwareReading } from "./productionHardware";

const DIP_DROP_C = 20;
const DIP_RECOVER_C = 10;
const BELOW_C = 340;
const PIECE_GAP_MS = 3 * 60 * 1000;
const FAST_PER_MINUTE = 60;
const FAST_MIN_DROP = 50;
const SHOULDER_C = 15;
const SHOULDER_MS = 2 * 60 * 1000;

export interface TemperaturePoint {
  at: string;
  c: number;
}

export interface TemperatureDip {
  at: string;
  trough_c: number;
  peak_c: number;
}

export interface RapidDrop {
  start_at: string;
  end_at: string;
  from_c: number;
  to_c: number;
  duration_seconds: number;
  degrees_per_minute: number;
}

export interface SensorAnalysis {
  version: 2;
  device_id: string | null;
  computed_at: string;
  reading_count: number;
  window_from: string | null;
  window_to: string | null;
  highest_c: number;
  highest_at: string;
  lowest_c: number;
  lowest_at: string;
  dip_count: number;
  dips: TemperatureDip[];
  crossed_340_at: string | null;
  dips_below_340_count: number;
  dips_below_340: Array<{ at: string; trough_c: number }>;
  rapid_drops: RapidDrop[];
  quench: RapidDrop | null;
}

function roundC(value: number) {
  return Math.round(value * 10) / 10;
}

function roundRate(value: number) {
  return Math.round(value * 10) / 10;
}

function temperatureLike(key: string) {
  return /t1$|t2$|t3$|temp/i.test(key);
}

function usable(value: number) {
  return value >= -40 && value <= 1300;
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

/** Probe temperatures on the same clock the chart uses (`received_at`). */
export function temperatureTrace(readings: HardwareReading[]): TemperaturePoint[] {
  const rows = readings
    .map((reading) => ({
      atMs: Date.parse(reading.received_at),
      flat: flatten(reading.payload),
    }))
    .filter((row) => Number.isFinite(row.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.flat)) {
      if (!temperatureLike(key)) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || !usable(number)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!key) return [];

  const points = rows.flatMap((row) => {
    const number = Number(row.flat[key]);
    if (!Number.isFinite(number) || !usable(number)) return [];
    return [{ at: new Date(row.atMs).toISOString(), c: number }];
  });
  return points.filter((point, index) => {
    if (point.c >= 20) return true;
    const neighbors = [points[index - 1], points[index + 1]].filter(
      (item): item is TemperaturePoint => item != null,
    );
    return neighbors.every((other) => other.c - point.c < 80);
  });
}

function findDips(points: TemperaturePoint[]): TemperatureDip[] {
  if (points.length < 2) return [];
  const dips: TemperatureDip[] = [];
  let peak = points[0].c;
  let trough = points[0].c;
  let troughAt = points[0].at;
  let falling = false;

  for (const point of points.slice(1)) {
    if (!falling) {
      if (point.c >= peak) {
        peak = point.c;
        trough = point.c;
        troughAt = point.at;
      } else if (peak - point.c >= DIP_DROP_C) {
        falling = true;
        trough = point.c;
        troughAt = point.at;
      }
      continue;
    }
    if (point.c < trough) {
      trough = point.c;
      troughAt = point.at;
    } else if (point.c - trough >= DIP_RECOVER_C) {
      dips.push({ at: troughAt, trough_c: roundC(trough), peak_c: roundC(peak) });
      falling = false;
      peak = point.c;
      trough = point.c;
      troughAt = point.at;
    }
  }
  if (falling) {
    dips.push({ at: troughAt, trough_c: roundC(trough), peak_c: roundC(peak) });
  }
  return dips;
}

function dipsBelow340(points: TemperaturePoint[]): {
  crossed_at: string | null;
  dips: Array<{ at: string; trough_c: number }>;
} {
  const first = points.find((point) => point.c >= BELOW_C);
  if (!first) return { crossed_at: null, dips: [] };
  const dips: Array<{ at: string; trough_c: number }> = [];
  let below = false;
  let trough = Number.POSITIVE_INFINITY;
  let troughAt = first.at;
  for (const point of points) {
    if (Date.parse(point.at) < Date.parse(first.at)) continue;
    if (!below) {
      if (point.c < BELOW_C) {
        below = true;
        trough = point.c;
        troughAt = point.at;
      }
      continue;
    }
    if (point.c < trough) {
      trough = point.c;
      troughAt = point.at;
    } else if (point.c >= BELOW_C) {
      dips.push({ at: troughAt, trough_c: roundC(trough) });
      below = false;
    }
  }
  if (below) dips.push({ at: troughAt, trough_c: roundC(trough) });
  return { crossed_at: first.at, dips };
}

/** Steepest sustained falls. A step counts when it cools at 60°C/min or faster. */
function fastestDips(points: TemperaturePoint[]): RapidDrop[] {
  const episodes: RapidDrop[] = [];
  let runStart = -1;

  const close = (endIndex: number) => {
    if (runStart < 0) return;
    let startIndex = runStart;
    const lip = points[runStart].c;
    const earliest = Date.parse(points[runStart].at) - SHOULDER_MS;
    while (startIndex > 0) {
      const previous = points[startIndex - 1];
      const gap = Date.parse(points[startIndex].at) - Date.parse(previous.at);
      if (gap > PIECE_GAP_MS || Date.parse(previous.at) < earliest) break;
      if (previous.c > lip + SHOULDER_C || previous.c + 5 < points[startIndex].c) break;
      startIndex -= 1;
    }
    const from = points[startIndex];
    const to = points[endIndex];
    const duration = (Date.parse(to.at) - Date.parse(from.at)) / 1000;
    const fallen = from.c - to.c;
    if (duration > 0 && fallen >= FAST_MIN_DROP) {
      episodes.push({
        start_at: from.at,
        end_at: to.at,
        from_c: roundC(from.c),
        to_c: roundC(to.c),
        duration_seconds: Math.round(duration),
        degrees_per_minute: roundRate(fallen / (duration / 60)),
      });
    }
    runStart = -1;
  };

  for (let index = 1; index < points.length; index += 1) {
    const seconds = (Date.parse(points[index].at) - Date.parse(points[index - 1].at)) / 1000;
    const rate = seconds > 0 ? ((points[index - 1].c - points[index].c) / seconds) * 60 : 0;
    const fast = seconds > 0 && seconds <= PIECE_GAP_MS / 1000 && rate >= FAST_PER_MINUTE;
    if (fast) {
      if (runStart < 0) runStart = index - 1;
    } else if (runStart >= 0) {
      close(index - 1);
    }
  }
  if (runStart >= 0) close(points.length - 1);
  return episodes.sort((a, b) => b.degrees_per_minute - a.degrees_per_minute);
}

export function analyseTemperatureTrace(
  readings: HardwareReading[],
  input: { deviceId: string | null; windowFrom: string | null; windowTo: string | null },
): SensorAnalysis | null {
  const points = temperatureTrace(readings);
  if (points.length < 2) return null;
  let highest = points[0];
  let lowest = points[0];
  for (const point of points) {
    if (point.c > highest.c) highest = point;
    if (point.c < lowest.c) lowest = point;
  }
  const dips = findDips(points);
  const below = dipsBelow340(points);
  const rapid = fastestDips(points);
  const quench = rapid[0] ?? null;

  return {
    version: 2,
    device_id: input.deviceId,
    computed_at: new Date().toISOString(),
    reading_count: points.length,
    window_from: input.windowFrom,
    window_to: input.windowTo,
    highest_c: roundC(highest.c),
    highest_at: highest.at,
    lowest_c: roundC(lowest.c),
    lowest_at: lowest.at,
    dip_count: dips.length,
    dips,
    crossed_340_at: below.crossed_at,
    dips_below_340_count: below.dips.length,
    dips_below_340: below.dips,
    rapid_drops: rapid,
    quench,
  };
}

export function isSensorAnalysis(value: unknown): value is SensorAnalysis {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SensorAnalysis>;
  return record.version === 2 && typeof record.highest_c === "number" && typeof record.lowest_c === "number";
}
