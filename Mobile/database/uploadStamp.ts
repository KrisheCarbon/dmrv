import type * as SQLite from "expo-sqlite";
import { getTrustedUtcMs } from "../services/trustedtime";

const TABLES = new Set([
  "farmers",
  "farm_fields",
  "farmer_consents",
  "soil_tests",
  "soil_reports",
  "biomass_collections",
  "mixing_entries",
  "application_entries",
  "pyrolysis_sessions",
  "pyrolysis_batches",
  "rainbow_pyrolysis_batches",
  "encrypted_batches",
]);

export function serverUploadedAt(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const stamp = (value as { uploaded_at?: unknown }).uploaded_at;
  return typeof stamp === "string" && stamp.length > 0 ? stamp : null;
}

/** Records the first successful upload time. A later sync does not replace it. */
export async function stampUploadedAt(
  db: SQLite.SQLiteDatabase,
  table: string,
  id: string,
  serverUploadedAtValue?: string | null,
) {
  if (!TABLES.has(table)) throw new Error(`Cannot stamp uploads on ${table}.`);
  const stamp = serverUploadedAtValue || new Date(getTrustedUtcMs()).toISOString();
  await db.runAsync(
    `UPDATE ${table} SET uploaded_at = COALESCE(uploaded_at, ?) WHERE id = ?`,
    [stamp, id],
  );
}
