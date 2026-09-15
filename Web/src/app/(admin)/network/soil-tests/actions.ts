"use server";

import { backendFetch } from "@/lib/backendApi";
import type {
  SoilTestRecord,
  SoilTestReportPayload,
} from "@krishecarbon/shared";

export async function listSoilTests(farmId?: string): Promise<SoilTestRecord[]> {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendFetch<SoilTestRecord[]>(`/soil-tests${query}`);
}

export async function receiveSoilTest(id: string): Promise<SoilTestRecord> {
  return backendFetch<SoilTestRecord>(`/soil-tests/${id}/receive`, {
    method: "PATCH",
  });
}

export async function attachSoilReport(
  id: string,
  payload: SoilTestReportPayload,
): Promise<SoilTestRecord> {
  return backendFetch<SoilTestRecord>(`/soil-tests/${id}/report`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
