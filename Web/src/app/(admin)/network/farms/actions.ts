"use server";

import type { FarmUpsertPayload, PagedResult } from "@krishecarbon/shared";
import { backendFetch, backendQuery } from "@/lib/backendApi";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { FarmDetail } from "@/types";

export async function listFarms() {
  return backendQuery<FarmDetail[]>("/farms");
}

/**
 * One page of farmers, read straight from the database.
 * Skips the backend so a sleeping server cannot hold the table.
 */
export async function listFarmsPage(params: {
  page: number;
  pageSize: number;
  sort?: string | null;
  dir?: "asc" | "desc";
  filters?: Record<string, string>;
}): Promise<{ data: PagedResult<FarmDetail> | null; error: string | null }> {
  const filters = params.filters ?? {};
  const term = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return { data: null, error: "You must be signed in." };
    }

    const { data, error } = await supabase.rpc("list_farmers_page", {
      p_page: params.page,
      p_page_size: params.pageSize,
      p_sort: params.sort ?? null,
      p_dir: params.dir ?? null,
      p_name: term(filters.name),
      p_mobile: term(filters.mobile),
      p_location: term(filters.location),
      p_state: term(filters.state),
    });

    if (error) return { data: null, error: error.message };
    return { data: data as PagedResult<FarmDetail>, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to load farmers",
    };
  }
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
