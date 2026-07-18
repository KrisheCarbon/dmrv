import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getBackendUrl } from "@/lib/env";

function parseApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(", ") : message;
  }
  return `Request failed (${status})`;
}

async function getAccessToken(): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }

  return session.access_token;
}

export async function backendFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${getBackendUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Cannot reach the backend at ${getBackendUrl()}. Make sure it is running (npm run dev:backend).`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return undefined as T;
  }

  const body: unknown = JSON.parse(text);

  if (!response.ok) {
    throw new Error(parseApiError(body, response.status));
  }

  return body as T;
}
