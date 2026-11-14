"use server";

import { readFileSync } from "node:fs";
import path from "node:path";
import { isSensorAnalysis, type SensorAnalysis } from "./sensorAnalysis";

const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceCredentials() {
  const fromEnv = {
    url: process.env.SUPABASE_URL?.trim(),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
  if (fromEnv.url && fromEnv.key) return { url: fromEnv.url.replace(/\/$/, ""), key: fromEnv.key };
  try {
    const file = readFileSync(path.resolve(process.cwd(), "../Backend/.env"), "utf8");
    const read = (name: string) => file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
    const url = read("SUPABASE_URL");
    const key = read("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) return { url: url.replace(/\/$/, ""), key };
  } catch {
    // Production has no local Backend/.env. The service role must be set in the host environment.
  }
  throw new Error("Sensor analysis storage is not configured.");
}

async function rest(pathAndQuery: string, init: RequestInit = {}) {
  const { url, key } = serviceCredentials();
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Sensor analysis was not saved (${response.status}).`);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function readSensorAnalysis(batchId: string): Promise<SensorAnalysis | null> {
  if (!BATCH_ID.test(batchId)) return null;
  const rows = await rest(
    `pyrolysis_sensor_analyses?batch_id=eq.${batchId}&select=analysis`,
  );
  const analysis = Array.isArray(rows) ? rows[0]?.analysis : null;
  return isSensorAnalysis(analysis) ? analysis : null;
}

/** Keeps the saved copy. An older analysis is replaced once with the current slope rule. */
export async function storeSensorAnalysis(
  batchId: string,
  analysis: SensorAnalysis,
): Promise<SensorAnalysis> {
  if (!BATCH_ID.test(batchId)) throw new Error("This production entry has no id.");
  if (!isSensorAnalysis(analysis)) throw new Error("The curve analysis is incomplete.");
  const existing = await readSensorAnalysis(batchId);
  if (existing) return existing;

  const rows = await rest(`pyrolysis_sensor_analyses?batch_id=eq.${batchId}&select=batch_id`);
  const hasRow = Array.isArray(rows) && rows.length > 0;
  if (hasRow) {
    await rest(`pyrolysis_sensor_analyses?batch_id=eq.${batchId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ analysis }),
    });
  } else {
    await rest("pyrolysis_sensor_analyses?on_conflict=batch_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ batch_id: batchId, analysis }),
    });
  }
  await rest(`rainbow_pyrolysis_batches?id=eq.${batchId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ sensor_analysis: analysis }),
  }).catch(() => undefined);
  await rest(`csi_pyrolysis_batches?id=eq.${batchId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ sensor_analysis: analysis }),
  }).catch(() => undefined);

  return (await readSensorAnalysis(batchId)) ?? analysis;
}
