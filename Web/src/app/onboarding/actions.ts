"use server";

import { backendFetch } from "@/lib/backendApi";

export async function completeOnboarding({ userId }: { userId: string }) {
  const profile = await backendFetch<{ id: string }>("/auth/me");
  if (profile.id !== userId) {
    throw new Error("Unauthorized");
  }
  await backendFetch("/auth/signup-complete", { method: "POST" });
  return true;
}
