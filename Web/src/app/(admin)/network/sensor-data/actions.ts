"use server";

import { backendFetch } from "@/lib/backendApi";
import type { KilnBatchDetail, KilnBatchSummary } from "@/types";

export async function listKilnBatches() {
  return backendFetch<KilnBatchSummary[]>("/kiln-batches");
}

export async function getKilnBatch(id: string) {
  return backendFetch<KilnBatchDetail>(`/kiln-batches/${id}`);
}
