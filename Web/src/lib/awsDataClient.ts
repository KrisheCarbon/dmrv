import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBackendUrl } from "@/lib/env";

/**
 * Table queries go through the AWS API, which reads the AWS database.
 * Login and stored files stay on the Supabase client.
 */
export function createAwsDataClient(accessToken: string): SupabaseClient {
  const backend = getBackendUrl().replace(/\/$/, "");
  return createClient(`${backend}/data`, accessToken, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => forwardDataRequest(backend, accessToken, input, init),
    },
  });
}

function forwardDataRequest(
  backend: string,
  accessToken: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const rawUrl = request ? request.url : input instanceof URL ? input.toString() : String(input);
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/\/data\/rest\/v1/, "/data");
  if (!url.pathname.startsWith("/data")) {
    url.href = `${backend}/data${url.pathname}${url.search}`;
  }

  const headers = new Headers(init?.headers ?? request?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.delete("apikey");

  const method = init?.method ?? request?.method ?? "GET";
  const body = init?.body ?? request?.body;
  const next: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    signal: init?.signal ?? request?.signal,
  };
  if (body != null && method !== "GET" && method !== "HEAD") {
    next.body = body;
    next.duplex = "half";
  }
  return fetch(url, next);
}
