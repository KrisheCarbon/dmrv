"use server";

import { backendFetch } from "@/lib/backendApi";
import type { ClusterDetail, ClusterFormOptions } from "@/types";
import type { ClusterVillageInput, ClusterVillageRecord } from "@krishecarbon/shared";

export interface ClusterSavePayload {
  name: string;
  villages: ClusterVillageInput[];
  supervisor_ids: string[];
  climapreneur_ids: string[];
}

export async function listClusters() {
  return backendFetch<ClusterDetail[]>("/clusters");
}

export async function getCluster(id: string) {
  return backendFetch<ClusterDetail>(`/clusters/${id}`);
}

export async function getClusterFormOptions() {
  return backendFetch<ClusterFormOptions>("/clusters/form-options");
}

export async function listClusterVillages() {
  return backendFetch<ClusterVillageRecord[]>("/clusters/village-options");
}

export async function createCluster(payload: ClusterSavePayload) {
  return backendFetch<ClusterDetail>("/clusters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCluster(id: string, payload: ClusterSavePayload) {
  return backendFetch<ClusterDetail>(`/clusters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteCluster(id: string) {
  await backendFetch<void>(`/clusters/${id}`, {
    method: "DELETE",
  });
}
