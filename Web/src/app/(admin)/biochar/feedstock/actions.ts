"use server";

import { backendFetch } from "@/lib/backendApi";
import type { FeedstockDetail } from "@/types";
import type {
  FeedstockSavePayload,
  FeedstockUpdatePayload,
} from "./feedstockLib";

export type { FeedstockSavePayload, FeedstockUpdatePayload } from "./feedstockLib";

export async function listFeedstocks() {
  return backendFetch<FeedstockDetail[]>("/feedstocks");
}

export async function getFeedstock(id: string) {
  return backendFetch<FeedstockDetail>(`/feedstocks/${id}`);
}

export async function createFeedstock(payload: FeedstockSavePayload) {
  return backendFetch<FeedstockDetail>("/feedstocks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateFeedstock(
  id: string,
  payload: FeedstockUpdatePayload,
) {
  return backendFetch<FeedstockDetail>(`/feedstocks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteFeedstock(id: string) {
  await backendFetch<void>(`/feedstocks/${id}`, {
    method: "DELETE",
  });
}
