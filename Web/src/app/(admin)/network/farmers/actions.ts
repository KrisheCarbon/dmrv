"use server";

import { backendFetch } from "@/lib/backendApi";
import type {
  FarmerConsentRecord,
  FarmerConsentUpsertPayload,
} from "@krishecarbon/shared";

export async function listFarmerConsents(
  farmId?: string,
): Promise<FarmerConsentRecord[]> {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : "";
  return backendFetch<FarmerConsentRecord[]>(`/farmer-consents${query}`);
}

export async function createFarmerConsent(
  payload: FarmerConsentUpsertPayload,
): Promise<FarmerConsentRecord> {
  return backendFetch<FarmerConsentRecord>("/farmer-consents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
