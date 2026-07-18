"use server";

import { backendFetch } from "@/lib/backendApi";
import type { BiocharProducerDetail } from "@/types";
import type { ProducerSavePayload } from "./producerLib";

export type { ProducerSavePayload, ProducerSitePayload } from "./producerLib";

export async function listProducers() {
  return backendFetch<BiocharProducerDetail[]>("/biochar-producers");
}

export async function getProducer(id: string) {
  return backendFetch<BiocharProducerDetail>(`/biochar-producers/${id}`);
}

export async function createProducer(payload: ProducerSavePayload) {
  return backendFetch<BiocharProducerDetail>("/biochar-producers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProducer(
  id: string,
  payload: Partial<ProducerSavePayload>,
) {
  return backendFetch<BiocharProducerDetail>(`/biochar-producers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteProducer(id: string) {
  await backendFetch<void>(`/biochar-producers/${id}`, {
    method: "DELETE",
  });
}
