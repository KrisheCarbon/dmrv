"use server";

import { backendFetch } from "@/lib/backendApi";
import type { FarmFieldRecord } from "@krishecarbon/shared";

export async function listFarmFields(farmId?: string): Promise<FarmFieldRecord[]> {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendFetch<FarmFieldRecord[]>(`/farm-fields${query}`);
}
