"use server";

import { backendFetch } from "@/lib/backendApi";
import type { SentUpdate, UpdateInbox, UpdateRecipient } from "./types";

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function listUpdateInbox(): Promise<{
  inbox: UpdateInbox | null;
  error: string | null;
}> {
  try {
    const inbox = await backendFetch<UpdateInbox>("/updates/inbox");
    return { inbox, error: null };
  } catch (err) {
    return { inbox: null, error: message(err, "Could not load updates.") };
  }
}

export async function sendUpdate(input: {
  title: string;
  body: string;
  audience: "all" | "role" | "user";
  target_role?: string;
  target_user_id?: string;
}): Promise<{ update: SentUpdate | null; error: string | null }> {
  try {
    const update = await backendFetch<SentUpdate>("/updates", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { update, error: null };
  } catch (err) {
    return { update: null, error: message(err, "Could not send the update.") };
  }
}

export async function searchUpdateRecipients(
  query: string,
): Promise<{ people: UpdateRecipient[]; error: string | null }> {
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const path = params.size ? `/updates/recipients?${params}` : "/updates/recipients";
    const people = await backendFetch<UpdateRecipient[]>(path);
    return { people, error: null };
  } catch (err) {
    return { people: [], error: message(err, "Could not search people.") };
  }
}

export async function markUpdateRead(id: string): Promise<{ error: string | null }> {
  try {
    await backendFetch(`/updates/${id}/read`, { method: "POST" });
    return { error: null };
  } catch (err) {
    return { error: message(err, "Could not mark that update as read.") };
  }
}

export async function markAllUpdatesRead(): Promise<{ error: string | null }> {
  try {
    await backendFetch("/updates/read-all", { method: "POST" });
    return { error: null };
  } catch (err) {
    return { error: message(err, "Could not mark updates as read.") };
  }
}
