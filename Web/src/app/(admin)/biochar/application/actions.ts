"use server";

import { backendFetch } from "@/lib/backendApi";
import { fetchPortalProfile } from "@/lib/portalRole";
import { canReviewApplicationEntries } from "@krishecarbon/shared";
import type { SubmitApplicationEntryStatusPayload } from "@krishecarbon/shared";
import type { ApplicationEntryDetail, ApplicationEntryListItem } from "./applicationLib";

export async function canCurrentUserReviewApplicationEntries() {
  const profile = await fetchPortalProfile();
  return profile ? canReviewApplicationEntries(profile.role) : false;
}

export async function listApplicationEntries() {
  return backendFetch<ApplicationEntryListItem[]>("/application-entries");
}

export async function getApplicationEntry(id: string) {
  return backendFetch<ApplicationEntryDetail>(`/application-entries/${id}`);
}

export async function submitApplicationEntryStatus(
  id: string,
  payload: SubmitApplicationEntryStatusPayload,
) {
  return backendFetch<ApplicationEntryDetail>(`/application-entries/${id}/entry-status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
