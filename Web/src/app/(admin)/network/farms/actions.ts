"use server";

import type { FarmUpsertPayload } from "@krishecarbon/shared";
import { backendFetch } from "@/lib/backendApi";
import type { FarmDetail } from "@/types";

export async function listFarms(): Promise<FarmDetail[]> {
  return backendFetch<FarmDetail[]>("/farms");
}

export async function getFarm(id: string): Promise<FarmDetail> {
  return backendFetch<FarmDetail>(`/farms/${id}`);
}

export async function createFarm(
  payload: FarmUpsertPayload,
): Promise<FarmDetail> {
  return backendFetch<FarmDetail>("/farms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFarm(
  id: string,
  payload: FarmUpsertPayload,
): Promise<FarmDetail> {
  return backendFetch<FarmDetail>(`/farms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteFarm(id: string): Promise<void> {
  await backendFetch<void>(`/farms/${id}`, {
    method: "DELETE",
  });
}
