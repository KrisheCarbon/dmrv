"use server";

import { backendFetch } from "@/lib/backendApi";
import type { KontikkiDetail } from "@/types";

export interface KontikkiSavePayload {
  kontikki_code: string;
  module_id?: string | null;
  biochar_producer_id: string;
  status: "active" | "inactive";
  top_diameter_cm: number;
  bottom_diameter_cm: number;
  depth_cm: number;
  capacity: number;
  operator_ids?: string[];
  plan_pdf_url?: string | null;
  top_photo_urls?: string[];
  bottom_photo_urls?: string[];
}

export type KontikkiUpdatePayload = Partial<KontikkiSavePayload>;

export async function listKontikkis(biocharProducerId?: string) {
  const query = biocharProducerId
    ? `?biochar_producer_id=${encodeURIComponent(biocharProducerId)}`
    : "";
  return backendFetch<KontikkiDetail[]>(`/kontikkis${query}`);
}

export async function getKontikki(id: string) {
  return backendFetch<KontikkiDetail>(`/kontikkis/${id}`);
}

export async function createKontikki(payload: KontikkiSavePayload) {
  return backendFetch<KontikkiDetail>("/kontikkis", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateKontikki(id: string, payload: KontikkiUpdatePayload) {
  return backendFetch<KontikkiDetail>(`/kontikkis/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteKontikki(id: string) {
  await backendFetch<void>(`/kontikkis/${id}`, {
    method: "DELETE",
  });
}
