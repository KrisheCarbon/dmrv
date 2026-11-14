"use server";

import { backendFetch } from "@/lib/backendApi";
import { getSensorApiUrl } from "@/lib/env";
import { hardwareImei, matchHardwareDevice } from "../production/productionHardware";

const IST_STORED_AS_UTC_MS = 5.5 * 60 * 60 * 1000;

export interface SensorCoverage {
  stored_from: string | null;
  stored_to: string | null;
  returned_from: string | null;
  returned_to: string | null;
  returned_count: number;
  listed: boolean;
}

export interface LiveSensor {
  device_id: string | null;
  reading_count: number;
  first_at: string;
  last_at: string;
  live: boolean;
  latest_payload: Record<string, unknown> | null;
}

export interface SensorReadingRow {
  id: string;
  device_id: string | null;
  idempotency_key: string | null;
  received_at: string;
  payload: Record<string, unknown>;
}

export interface SensorReadingDetail {
  device_id: string;
  total: number;
  readings: SensorReadingRow[];
}

export async function listLiveSensors(): Promise<
  { sensors: LiveSensor[]; live_within_seconds: number } & { error: string | null }
> {
  try {
    const data = await backendFetch<{ sensors: LiveSensor[]; live_within_seconds: number }>(
      "/sensor-readings",
      {},
      getSensorApiUrl(),
    );
    return { ...data, error: null };
  } catch (err) {
    return {
      sensors: [],
      live_within_seconds: 30,
      error: err instanceof Error ? err.message : "Failed to load sensors",
    };
  }
}

export async function getProductionHardwareReadings(
  hardwareId: string,
  from: string,
  to: string,
): Promise<{
  device_id: string | null;
  readings: SensorReadingRow[];
  incomplete: boolean;
  error: string | null;
  coverage: SensorCoverage | null;
}> {
  const emptyCoverage: SensorCoverage = {
    stored_from: null,
    stored_to: null,
    returned_from: null,
    returned_to: null,
    returned_count: 0,
    listed: false,
  };
  try {
    const listed = await listLiveSensors();
    if (listed.error && listed.sensors.length === 0) {
      return { device_id: null, readings: [], incomplete: false, error: listed.error, coverage: null };
    }
    const imei = hardwareImei(hardwareId);
    const listedId = matchHardwareDevice(
      hardwareId,
      listed.sensors.map((sensor) => sensor.device_id),
    );
    const deviceId = listedId ?? imei;
    if (!deviceId) {
      return { device_id: null, readings: [], incomplete: false, error: null, coverage: null };
    }
    const known = listed.sensors.find((sensor) => sensor.device_id?.trim() === deviceId);
    const data = await loadDeviceReadings(deviceId, from, to);
    const start = Date.parse(from);
    const end = Date.parse(to);
    const utcHits = data.readings.filter((reading) => {
      const received = Date.parse(reading.received_at);
      return Number.isFinite(received) && received >= start && received <= end;
    }).length;
    const photoClockHits = data.readings.filter((reading) => {
      const received = Date.parse(reading.received_at);
      if (!Number.isFinite(received)) return false;
      const asPhotoClock = received - IST_STORED_AS_UTC_MS;
      return asPhotoClock >= start && asPhotoClock <= end;
    }).length;
    const useUtc = utcHits >= photoClockHits;
    const readings = data.readings.flatMap((reading) => {
      const received = Date.parse(reading.received_at);
      if (!Number.isFinite(received)) return [];
      if (useUtc) {
        if (received < start || received > end) return [];
        return [reading];
      }
      const asPhotoClock = received - IST_STORED_AS_UTC_MS;
      if (asPhotoClock < start || asPhotoClock > end) return [];
      return [{ ...reading, received_at: new Date(asPhotoClock).toISOString() }];
    });
    const pageTimes = data.readings
      .map((reading) => Date.parse(reading.received_at))
      .filter((at) => Number.isFinite(at))
      .sort((a, b) => a - b);
    const coverage: SensorCoverage = {
      stored_from: known?.first_at ?? null,
      stored_to: known?.last_at ?? null,
      returned_from: pageTimes.length ? new Date(pageTimes[0]).toISOString() : null,
      returned_to: pageTimes.length ? new Date(pageTimes[pageTimes.length - 1]).toISOString() : null,
      returned_count: data.readings.length,
      listed: Boolean(known),
    };
    const earliest = pageTimes[0] ?? null;
    const incomplete = earliest != null && earliest > start + 2 * 60 * 1000 && readings.length > 0;
    if (!known && readings.length === 0) {
      return { device_id: null, readings: [], incomplete: false, error: null, coverage };
    }
    return { device_id: deviceId, readings, incomplete, error: null, coverage };
  } catch (err) {
    return {
      device_id: null,
      readings: [],
      incomplete: false,
      error: err instanceof Error ? err.message : "Failed to load sensor readings",
      coverage: emptyCoverage,
    };
  }
}

async function loadWindowReadings(
  deviceId: string,
  from: string,
  to: string,
): Promise<SensorReadingDetail> {
  const params = new URLSearchParams({ from, to });
  const page = await backendFetch<SensorReadingDetail>(
    `/sensor-readings/${encodeURIComponent(deviceId)}?${params.toString()}`,
    {},
    getSensorApiUrl(),
  );
  return {
    device_id: page.device_id || deviceId,
    total: Number.isFinite(page.total) ? page.total : page.readings.length,
    readings: page.readings,
  };
}

async function loadDeviceReadings(deviceId: string, from: string, to: string): Promise<SensorReadingDetail> {
  const direct = await loadWindowReadings(deviceId, from, to);
  if (direct.readings.length > 0) return direct;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return direct;
  return loadWindowReadings(
    deviceId,
    new Date(start + IST_STORED_AS_UTC_MS).toISOString(),
    new Date(end + IST_STORED_AS_UTC_MS).toISOString(),
  );
}

export async function getLiveSensorReadings(
  deviceId: string,
): Promise<SensorReadingDetail & { error: string | null }> {
  try {
    const data = await backendFetch<SensorReadingDetail>(
      `/sensor-readings/${encodeURIComponent(deviceId)}`,
      {},
      getSensorApiUrl(),
    );
    return { ...data, error: null };
  } catch (err) {
    return {
      device_id: deviceId,
      total: 0,
      readings: [],
      error: err instanceof Error ? err.message : "Failed to load readings",
    };
  }
}
