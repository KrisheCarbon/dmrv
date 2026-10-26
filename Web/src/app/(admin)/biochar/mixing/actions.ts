"use server";

import { backendFetch } from "@/lib/backendApi";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canReviewMixingEntries } from "@krishecarbon/shared";
import type { SubmitMixingEntryStatusPayload } from "@krishecarbon/shared";
import type { MixingEntryDetail, MixingEntryListItem } from "./mixingLib";

export async function canCurrentUserReviewMixingEntries() {
  const profile = await fetchPortalProfile();
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
