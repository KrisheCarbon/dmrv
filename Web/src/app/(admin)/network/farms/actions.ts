"use server";

import type { FarmUpsertPayload, PagedResult } from "@krishecarbon/shared";
import { backendFetch, backendQuery } from "@/lib/backendApi";
import type { FarmDetail } from "@/types";

export async function listFarms() {
  return backendQuery<FarmDetail[]>("/farms");
}

export async function listFarmsPage(params: {
  page: number;
  pageSize: number;
  sort?: string | null;
  dir?: "asc" | "desc";
  filters?: Record<string, string>;
  /** farmer, farms, samples, reports. Several of the last three mean all of them. */
  record?: string;
}): Promise<{ data: PagedResult<FarmDetail> | null; error: string | null }> {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  if (params.record) search.set("record", params.record);
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    const trimmed = value?.trim();
    if (trimmed) search.set(key, trimmed);
  }
  return backendQuery<PagedResult<FarmDetail>>(`/farms?${search.toString()}`);
}

export async function getFarm(id: string) {
  return backendQuery<FarmDetail>(`/farms/${id}`);
}

export async function createFarm(
  payload: FarmUpsertPayload,
): Promise<FarmDetail> {
  return backendFetch<FarmDetail>("/farms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFarm(
  id: string,
  payload: FarmUpsertPayload,
): Promise<FarmDetail> {
  return backendFetch<FarmDetail>(`/farms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteFarm(id: string): Promise<void> {
  await backendFetch<void>(`/farms/${id}`, {
    method: "DELETE",
  });
}
