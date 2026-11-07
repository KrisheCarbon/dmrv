import { getBackendUrl, backendFetch } from "./backendApi";
import {
  anchorClockFromUtc,
  commitClockReport,
  noteGnssTime,
  pendingClockReport,
  type ClockSnapshot,
} from "./trustedtime";

const CLOCK_FETCH_MS = 8000;

async function readServerTime(): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOCK_FETCH_MS);
  try {
    const response = await fetch(`${getBackendUrl()}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { timestamp?: unknown };
    const serverMs = typeof body.timestamp === "string" ? Date.parse(body.timestamp) : NaN;
    return Number.isFinite(serverMs) ? serverMs : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function postClockCheck(snapshot: ClockSnapshot): Promise<boolean> {
  try {
    const saved = await backendFetch<{ saved?: boolean }>("/clock/checks", {
      method: "POST",
      body: JSON.stringify({
        device_time: snapshot.device_time_iso,
        gnss_time: snapshot.gnss_time_iso,
        time_source: snapshot.time_source,
        device_clock_offset_ms: snapshot.device_clock_offset_ms,
        clock_skew_detected: snapshot.clock_skew_detected,
      }),
    });
    return saved.saved !== false;
  } catch (err) {
    console.warn("[clock] check was not saved:", err instanceof Error ? err.message : err);
    return false;
  }
}

let reportInFlight = false;

async function flushClockReport() {
  if (reportInFlight) return;
  const report = pendingClockReport();
  if (!report) return;
  reportInFlight = true;
  try {
    if (await postClockCheck(report)) commitClockReport(report);
  } finally {
    reportInFlight = false;
  }
}

/** Reads the server clock, then runs the internal clock from that instant. */
export async function syncTrustedClock(): Promise<void> {
  const serverMs = await readServerTime();
  if (serverMs != null) anchorClockFromUtc(serverMs, "server");
  await flushClockReport();
}

/** Compares the kiln GPS clock with the phone and reports a new disagreement. */
export function observeGnssTime(utcEpoch: number) {
  if (!noteGnssTime(utcEpoch)) return;
  void flushClockReport();
}
