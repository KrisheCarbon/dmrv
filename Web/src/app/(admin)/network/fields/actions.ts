"use server";

import { backendFetch, backendQuery } from "@/lib/backendApi";
import type { FarmFieldRecord, FarmFieldUpsertPayload } from "@krishecarbon/shared";

export async function listFarmFields(farmId?: string) {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendQuery<FarmFieldRecord[]>(`/farm-fields${query}`);
}

/** Farms of just these farmers (one page of the farmers list). */
export async function listFarmFieldsForFarmers(farmIds: string[]) {
  if (farmIds.length === 0) return { data: [] as FarmFieldRecord[], error: null };
  return backendQuery<FarmFieldRecord[]>(`/farm-fields?farmIds=${farmIds.join(",")}`);
}

export async function createFarmField(
  payload: FarmFieldUpsertPayload,
): Promise<FarmFieldRecord> {
  return backendFetch<FarmFieldRecord>("/farm-fields", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFarmField(
  id: string,
  payload: Partial<FarmFieldUpsertPayload>,
): Promise<FarmFieldRecord> {
  return backendFetch<FarmFieldRecord>(`/farm-fields/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
