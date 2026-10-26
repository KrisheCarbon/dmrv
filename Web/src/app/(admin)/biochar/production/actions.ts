"use server";

import { backendFetch } from "@/lib/backendApi";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canReviewPyrolysisBatches } from "@krishecarbon/shared";
import type { SubmitPyrolysisBatchStatusPayload } from "@krishecarbon/shared";
import type { PyrolysisBatchDetail, PyrolysisBatchListItem } from "./productionLib";

export async function canCurrentUserReviewPyrolysisBatches() {
  const profile = await fetchPortalProfile();
  return profile ? canReviewPyrolysisBatches(profile.role) : false;
}

export async function listPyrolysisBatches() {
  return backendFetch<PyrolysisBatchListItem[]>("/pyrolysis-batches");
}

export async function getPyrolysisBatch(id: string) {
  return backendFetch<PyrolysisBatchDetail>(`/pyrolysis-batches/${id}`);
}

export async function submitPyrolysisBatchStatus(
  id: string,
  payload: SubmitPyrolysisBatchStatusPayload,
) {
  return backendFetch<PyrolysisBatchDetail>(`/pyrolysis-batches/${id}/batch-status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updatePyrolysisBatchYield(id: string, yieldPercent: number) {
  return backendFetch<PyrolysisBatchDetail>(`/pyrolysis-batches/${id}/yield`, {
    method: "PATCH",
    body: JSON.stringify({ yield_percent: yieldPercent }),
  });
}

export async function updatePyrolysisBatchVolumePercent(
  id: string,
  volumePercent: number | null,
) {
  return backendFetch<PyrolysisBatchDetail>(`/pyrolysis-batches/${id}/volume-percent`, {
    method: "PATCH",
    body: JSON.stringify({ volume_percent: volumePercent }),
  });
}
