"use server";

import { backendFetch, backendQuery } from "@/lib/backendApi";
import type {
  FarmerConsentRecord,
  FarmerConsentUpsertPayload,
} from "@krishecarbon/shared";

export async function listFarmerConsents(farmId?: string) {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendQuery<FarmerConsentRecord[]>(`/farmer-consents${query}`);
}

export async function createFarmerConsent(
  payload: FarmerConsentUpsertPayload,
): Promise<FarmerConsentRecord> {
  return backendFetch<FarmerConsentRecord>("/farmer-consents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
