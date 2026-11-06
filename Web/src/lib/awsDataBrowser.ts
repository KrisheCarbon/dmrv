"use client";

import { getBackendUrl } from "@/lib/env";
import { readCognitoIdToken } from "@/lib/cognitoSession";
import { supabase } from "@/lib/supabase";
import { createAwsDataClient } from "@/lib/awsDataClient";

async function browserAccessToken(): Promise<string | null> {
  const cognito = readCognitoIdToken();
  if (cognito) return cognito;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function fetchOwnProfile<T>(): Promise<T | null> {
  const token = await browserAccessToken();
  if (!token) return null;
  const response = await fetch(`${getBackendUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export async function browserData() {
  const token = await browserAccessToken();
  if (!token) {
    throw new Error("You must be signed in.");
  }
  return createAwsDataClient(token);
}
