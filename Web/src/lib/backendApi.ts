import { getBackendUrl } from "@/lib/env";
import { getPortalAccessToken } from "@/lib/portalToken";
import type { QueryResult } from "@/lib/queryResult";

export type { QueryResult };

function parseApiError(body: unknown, status: number, path: string, baseUrl: string): string {
  if (status === 404) {
    return `API ${path} was not found on ${baseUrl}. The running backend is missing this route.`;
  }
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(", ") : message;
  }
  return `Request failed (${status})`;
}

async function getAccessToken(): Promise<string> {
  const token = await getPortalAccessToken();
  if (!token) {
    throw new Error("You must be signed in.");
  }
  return token;
}

export async function backendFetch<T>(
  path: string,
  init: RequestInit = {},
  baseUrl = getBackendUrl(),
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Cannot reach the backend at ${baseUrl}. Make sure it is running (npm run dev:backend).`,
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
    throw new Error(parseApiError(body, response.status, path, baseUrl));
  }

  return body as T;
}

/** GET/list helper that returns errors as data so Next.js does not hide them. */
export async function backendQuery<T>(
  path: string,
  init: RequestInit = {},
): Promise<QueryResult<T>> {
  try {
    return { data: await backendFetch<T>(path, init), error: null };
  } catch (err) {
    const error =
      err instanceof Error ? err.message : `Request failed for ${path}`;
    console.error(`backendQuery ${path}:`, error);
    return { data: null, error };
  }
}
