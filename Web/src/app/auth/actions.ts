"use server";

import { getBackendUrl } from "@/lib/env";

export async function lookupLoginEmailByPhone(
  phone: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${getBackendUrl()}/auth/login-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { email?: string | null };
    return body.email ?? null;
  } catch {
    return null;
  }
}
