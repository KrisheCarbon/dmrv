"use client";

import { getBackendUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { createAwsDataClient } from "@/lib/awsDataClient";

export async function fetchOwnProfile<T>(): Promise<T | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const response = await fetch(`${getBackendUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export async function browserData() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }
  return createAwsDataClient(session.access_token);
}
