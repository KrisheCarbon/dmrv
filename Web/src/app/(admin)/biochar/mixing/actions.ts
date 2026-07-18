"use server";

import { backendFetch } from "@/lib/backendApi";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { canReviewMixingEntries } from "@krishecarbon/shared";
import type { SubmitMixingEntryStatusPayload } from "@krishecarbon/shared";
import type { MixingEntryDetail, MixingEntryListItem } from "./mixingLib";

export async function canCurrentUserReviewMixingEntries() {
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

  return profile ? canReviewMixingEntries(profile.role) : false;
}

export async function listMixingEntries() {
  return backendFetch<MixingEntryListItem[]>("/mixing-entries");
}

export async function getMixingEntry(id: string) {
  return backendFetch<MixingEntryDetail>(`/mixing-entries/${id}`);
}

export async function submitMixingEntryStatus(
  id: string,
  payload: SubmitMixingEntryStatusPayload,
) {
  return backendFetch<MixingEntryDetail>(`/mixing-entries/${id}/entry-status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
