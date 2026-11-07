// Capture time starts from a trusted clock, then advances on a monotonic
// timer. A change to the phone's date settings does not move that timer.
// The trusted source is the server when the phone has reached it, otherwise
// the kiln GPS clock, otherwise the phone clock.

const SKEW_LIMIT_MS = 3 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type TimeSource = "device" | "server" | "gnss";

export type ClockSnapshot = {
  device_time_iso: string;
  trusted_time_iso: string;
  time_source: TimeSource;
  device_clock_offset_ms: number;
  clock_skew_detected: boolean;
  gnss_time_iso: string | null;
};

let anchorPerf: number | null = null;
let anchorUtcMs: number | null = null;
let anchorSource: TimeSource = "device";
let serverSkew = false;
let gnssSkew = false;
let lastGnssUtcMs: number | null = null;
let lastReportedKey = "";

function reportKey(snapshot: ClockSnapshot): string {
  return [
    snapshot.time_source,
    snapshot.clock_skew_detected ? "1" : "0",
    snapshot.gnss_time_iso ? "gnss" : "",
    String(Math.round(snapshot.device_clock_offset_ms / SKEW_LIMIT_MS)),
  ].join(":");
}

function ensureAnchor() {
  if (anchorPerf == null || anchorUtcMs == null) {
    anchorUtcMs = Date.now();
    anchorPerf = performance.now();
    anchorSource = "device";
  }
}

/** Starts the clock from the phone. A later server or GNSS anchor replaces it. */
export function initISTClock() {
  if (anchorSource === "server" || anchorSource === "gnss") return;
  anchorUtcMs = Date.now();
  anchorPerf = performance.now();
  anchorSource = "device";
}

export function getTrustedUtcMs(): number {
  ensureAnchor();
  return anchorUtcMs! + (performance.now() - anchorPerf!);
}

/**
 * IST timestamp used on photo watermarks and capture fields.
 * The value is the trusted UTC instant shifted to India time, matching the
 * watermark formatter, which reads the UTC fields of this string.
 */
export function getCurrentIST(): string {
  return new Date(getTrustedUtcMs() + IST_OFFSET_MS).toISOString();
}

/**
 * Move the internal clock onto an external UTC instant.
 * Returns true when the check result changed and should be reported.
 */
export function anchorClockFromUtc(utcMs: number, source: "server" | "gnss"): boolean {
  if (!Number.isFinite(utcMs)) return false;
  const offset = Date.now() - utcMs;
  const skew = Math.abs(offset) > SKEW_LIMIT_MS;

  if (source === "server") {
    serverSkew = skew;
    anchorUtcMs = utcMs;
    anchorPerf = performance.now();
    anchorSource = "server";
  } else {
    lastGnssUtcMs = utcMs;
    gnssSkew = skew;
    // The server clock stays in charge once login has reached it.
    // GNSS still records a disagreement with the phone.
    if (anchorSource !== "server") {
      anchorUtcMs = utcMs;
      anchorPerf = performance.now();
      anchorSource = "gnss";
    }
  }

  return reportKey(clockSnapshot()) !== lastReportedKey;
}

export function noteGnssTime(utcEpoch: number): boolean {
  const ms =
    utcEpoch > 1e12 ? utcEpoch : utcEpoch > 1_000_000_000 ? utcEpoch * 1000 : 0;
  if (!ms) return false;
  return anchorClockFromUtc(ms, "gnss");
}

export function clockSnapshot(): ClockSnapshot {
  ensureAnchor();
  const trusted = getTrustedUtcMs();
  const offset = Math.round(Date.now() - trusted);
  const liveSkew = Math.abs(offset) > SKEW_LIMIT_MS;
  return {
    device_time_iso: new Date().toISOString(),
    trusted_time_iso: new Date(trusted).toISOString(),
    time_source: anchorSource,
    device_clock_offset_ms: offset,
    clock_skew_detected: serverSkew || gnssSkew || liveSkew,
    gnss_time_iso: lastGnssUtcMs == null ? null : new Date(lastGnssUtcMs).toISOString(),
  };
}

/** The latest check, when it has not been saved yet. */
export function pendingClockReport(): ClockSnapshot | null {
  const snap = clockSnapshot();
  if (reportKey(snap) === lastReportedKey) return null;
  return snap;
}

export function commitClockReport(snapshot: ClockSnapshot) {
  lastReportedKey = reportKey(snapshot);
}
