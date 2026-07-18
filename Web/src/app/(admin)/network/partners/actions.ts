"use server";

import { backendFetch } from "@/lib/backendApi";
import type { PartnerOrg } from "@/types";

export interface PartnerSavePayload {
  org_name: string;
  cin_number?: string | null;
  base_location: string;
  farmer_base: number;
  states_of_operation: string[];
  crop_types: string[];
  bank_account_holders_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  bank_address: string;
  pan_card_url?: string | null;
  mou_url?: string | null;
  status?: "active" | "inactive" | "draft";
}

export type PartnerUpdatePayload = Partial<PartnerSavePayload>;

export async function listPartners() {
  return backendFetch<PartnerOrg[]>("/partners");
}

export async function getPartner(id: string) {
  return backendFetch<PartnerOrg>(`/partners/${id}`);
}

export async function createPartner(payload: PartnerSavePayload) {
  return backendFetch<PartnerOrg>("/partners", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePartner(id: string, payload: PartnerUpdatePayload) {
  return backendFetch<PartnerOrg>(`/partners/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePartner(id: string) {
  await backendFetch<void>(`/partners/${id}`, {
    method: "DELETE",
  });
}
