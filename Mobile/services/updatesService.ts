import { backendFetch } from "./backendApi";

export interface UpdateMessage {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  author_name: string | null;
}

export interface UpdateInbox {
  messages: UpdateMessage[];
  unread_count: number;
}

export function listUpdateInbox() {
  return backendFetch<UpdateInbox>("/updates/inbox");
}

export function markUpdateRead(id: string) {
  return backendFetch<{ ok: true }>(`/updates/${id}/read`, { method: "POST" });
}

export function markAllUpdatesRead() {
  return backendFetch<{ ok: true }>("/updates/read-all", { method: "POST" });
}

export function updatesErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "Could not load updates.";
  if (/network request failed/i.test(message)) {
    return "Connect to the internet to load updates. You can keep working offline.";
  }
  return message;
}
