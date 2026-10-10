"use server";

import type { FarmUpsertPayload, PagedResult } from "@krishecarbon/shared";
import { backendFetch, backendQuery } from "@/lib/backendApi";
import type { FarmDetail } from "@/types";

export async function listFarms() {
  return backendQuery<FarmDetail[]>("/farms");
}

/** One page of farmers, searched and sorted on the server. */
export async function listFarmsPage(params: {
  page: number;
  pageSize: number;
  sort?: string | null;
  dir?: "asc" | "desc";
  filters?: Record<string, string>;
}) {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value.trim()) search.set(key, value.trim());
  }
  const result = await backendQuery<PagedResult<FarmDetail> | FarmDetail[]>(`/farms?${search}`);
  if (!Array.isArray(result.data)) {
    return result as { data: PagedResult<FarmDetail> | null; error: string | null };
  }
  // An older backend ignores `page` and returns every farmer: page it here.
  const filters = params.filters ?? {};
  const has = (value: unknown, term?: string) =>
    !term?.trim() || String(value ?? "").toLowerCase().includes(term.trim().toLowerCase());
  const matching = result.data.filter(
    (farm) =>
      has(farm.farmer_name, filters.name) &&
      has(farm.mobile_number, filters.mobile) &&
      has([farm.village, farm.mandal, farm.district, farm.address].join(" "), filters.location) &&
      has(farm.state, filters.state),
  );
  const start = (params.page - 1) * params.pageSize;
  return {
    data: {
      rows: matching.slice(start, start + params.pageSize),
      total: matching.length,
      page: params.page,
      pageSize: params.pageSize,
    },
    error: null,
  };
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
