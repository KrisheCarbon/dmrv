"use server";

import { backendFetch } from "@/lib/backendApi";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { canReviewPyrolysisBatches } from "@krishecarbon/shared";
import type { SubmitPyrolysisBatchStatusPayload } from "@krishecarbon/shared";
import type { PyrolysisBatchDetail, PyrolysisBatchListItem } from "./productionLib";

export async function canCurrentUserReviewPyrolysisBatches() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

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
