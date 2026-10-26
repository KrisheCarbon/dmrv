import { backendFetch } from "@/lib/backendApi";

export interface PortalProfile {
  id: string;
  role: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  collector_code: string | null;
}

export async function getPortalRole(): Promise<string> {
  try {
    const profile = await backendFetch<PortalProfile>("/auth/me");
    return profile.role ?? "";
  } catch {
    return "";
  }
}

export async function fetchPortalProfile(): Promise<PortalProfile | null> {
  try {
    return await backendFetch<PortalProfile>("/auth/me");
  } catch {
    return null;
  }
}
