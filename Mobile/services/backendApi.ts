import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import { supabase } from "./supabase";

const extra = Constants.expoConfig?.extra as
  | {
      backendUrl?: string;
    }
  | undefined;

let cachedBackendUrl: string | null = null;

export function clearBackendUrlCache() {
  cachedBackendUrl = null;
}

function getMetroHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  if (!host || host === "127.0.0.1" || host === "localhost") return null;
  return host;
}

const PRODUCTION_BACKEND_URL = "https://d3einqtwag7iu2.cloudfront.net";

function isLocalBackendUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "10.0.2.2" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

function getCandidateBackendUrls(): string[] {
  const raw =
    extra?.backendUrl ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    "";

  const fromConfig = raw
    .split(",")
    .map((url) => url.trim().replace("localhost", "127.0.0.1"))
    .filter(Boolean);

  if (!__DEV__) {
    const remote = fromConfig.filter(
      (url) => !isLocalBackendUrl(url) && !/onrender\.com/i.test(url),
    );
    return [...new Set(remote.length > 0 ? remote : [PRODUCTION_BACKEND_URL])];
  }

  const metroHost = getMetroHost();
  const dynamic = metroHost ? [`http://${metroHost}:3001`] : [];

  return [
    ...new Set([
      "http://127.0.0.1:3001",
      ...dynamic,
      ...fromConfig,
      "http://192.168.1.17:3001",
    ]),
  ];
}

export function getBackendUrl(): string {
  return (
    cachedBackendUrl ||
    getCandidateBackendUrls()[0] ||
    (__DEV__ ? "http://127.0.0.1:3001" : PRODUCTION_BACKEND_URL)
  );
}

/** Field networks are slow. Give the first request time to finish. */
const COLD_START_BUDGET_MS = 75_000;
const PROBE_ATTEMPT_MS = 20_000;

async function deviceIsOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

async function probeOnce(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeBackendUrl(url: string): Promise<boolean> {
  const deadline = Date.now() + COLD_START_BUDGET_MS;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const ok = await probeOnce(url, Math.min(PROBE_ATTEMPT_MS, remaining));
    if (ok) return true;
    if (Date.now() + 2000 >= deadline) break;
    await wait(2000);
  }

  return false;
}

async function resolveBackendUrl(): Promise<string> {
  if (cachedBackendUrl) return cachedBackendUrl;

  if (!(await deviceIsOnline())) {
    throw new Error("No internet connection. Connect and pull down to try again.");
  }

  const candidates = getCandidateBackendUrls();
  const errors: string[] = [];

  for (const url of candidates) {
    const ok = await probeBackendUrl(url);
    if (ok) {
      cachedBackendUrl = url;
      console.log("[backend] connected via", url);
      return url;
    }
    errors.push(`${url}: unreachable`);
    console.warn("[backend] probe failed:", url);
  }

  console.warn("[backend] still unreachable:", errors.join(" | "));
  throw new Error("The server is still waking up. Pull down to try again in a moment.");
}

function parseApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
    if (message && typeof message === "object") {
      return JSON.stringify(message);
    }
  }

  return `Request failed (${status})`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the current Supabase access token, tolerating brief gaps while a
 * background refresh is in flight (e.g. after a weak-signal stretch or the
 * phone waking from sleep). Only throws once a few short retries — with an
 * explicit refresh attempt in between — all come back empty.
 */
async function getAccessToken(): Promise<string> {
  const RETRY_DELAYS_MS = [300, 800, 1500];

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return session.access_token;
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // Ignore — we'll re-check getSession() after the delay below.
      }
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error("You must be signed in.");
}

async function requestBackend<T>(
  backendUrl: string,
  path: string,
  init: RequestInit,
  token: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network request failed (${message})`);
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

export async function backendPublicFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let backendUrl = await resolveBackendUrl();

  try {
    return await requestBackendPublic<T>(backendUrl, path, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Network request failed")) {
      throw err;
    }

    clearBackendUrlCache();
    backendUrl = await resolveBackendUrl();
    return await requestBackendPublic<T>(backendUrl, path, init);
  }
}

async function requestBackendPublic<T>(
  backendUrl: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network request failed (${message})`);
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

export async function backendFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  let backendUrl = await resolveBackendUrl();

  try {
    return await requestBackend<T>(backendUrl, path, init, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Network request failed")) {
      throw err;
    }

    clearBackendUrlCache();
    backendUrl = await resolveBackendUrl();
    return await requestBackend<T>(backendUrl, path, init, token);
  }
}

export interface NetworkPerson {
  id: string;
  full_name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

export interface NetworkProducer {
  id: string;
  name: string;
  producer_code?: string | null;
  status?: string | null;
  contact_name?: string | null;
  mobile_number?: string | null;
  registry?: string | null;
}

export interface NetworkKontikki {
  id: string;
  kontikki_code: string;
  module_id?: string | null;
  status: string;
  capacity?: number | null;
  biochar_producer_id?: string | null;
  producer?: NetworkProducer | null;
  operators?: NetworkPerson[];
}

export interface NetworkFeedstock {
  id: string;
  biomass_type: string;
  lab_status: string;
  biochar_producer_id: string;
  producer?: NetworkProducer | null;
}

export interface NetworkFarm {
  id: string;
  farmer_name: string;
  address?: string | null;
  mobile_number?: string | null;
  village?: string | null;
  cluster_name?: string | null;
}

export interface MobileNetworkOverview {
  role: string;
  producers: NetworkProducer[];
  kontikkis: NetworkKontikki[];
  supervisors: NetworkPerson[];
  climapreneurs: NetworkPerson[];
  feedstock: NetworkFeedstock[];
  farms: NetworkFarm[];
}

export function fetchMobileNetworkOverview() {
  return backendFetch<MobileNetworkOverview>("/mobile-network");
}
