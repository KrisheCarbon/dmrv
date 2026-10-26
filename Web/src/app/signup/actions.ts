"use server";

import { backendFetch } from "@/lib/backendApi";
import { getBackendUrl } from "@/lib/env";
import type { SignupCheckResult } from "@/types";

export async function checkSignupEmail(
  email: string
): Promise<SignupCheckResult> {
  const response = await fetch(`${getBackendUrl()}/auth/signup-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not check this signup.");
  }
  return response.json();
}

export async function completeSignup({ userId }: { userId: string }) {
  const profile = await backendFetch<{ id: string }>("/auth/me");
  if (profile.id !== userId) {
    throw new Error("Unauthorized");
  }
  await backendFetch("/auth/signup-complete", { method: "POST" });
  return true;
}
