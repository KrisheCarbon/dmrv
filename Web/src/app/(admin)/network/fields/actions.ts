"use server";

import { backendFetch, backendQuery } from "@/lib/backendApi";
import type { FarmFieldRecord, FarmFieldUpsertPayload } from "@krishecarbon/shared";

export async function listFarmFields(farmId?: string) {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendQuery<FarmFieldRecord[]>(`/farm-fields${query}`);
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
