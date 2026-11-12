"use server";

import { backendFetch } from "@/lib/backendApi";
import { getSensorApiUrl } from "@/lib/env";

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
