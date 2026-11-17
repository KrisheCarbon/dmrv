import {
  INVALID_LOGIN_IDENTIFIER_ERROR,
  PHONE_LOGIN_NOT_FOUND_ERROR,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { backendFetch, backendPublicFetch } from "./backendApi";
import { readStoredUser, signOut, type StoredAuthUser } from "./cognitoSession";

export async function resolvePasswordLoginEmail(identifier: string): Promise<string> {
  const parsed = parseLoginIdentifier(identifier);
  if (parsed.kind === "email") return parsed.email;
  if (parsed.kind !== "phone") {
    throw new Error(INVALID_LOGIN_IDENTIFIER_ERROR);
  }

  const result = await backendPublicFetch<{ email: string | null }>(
    "/auth/login-email",
    {
      method: "POST",
      body: JSON.stringify({ phone: parsed.phone }),
    },
  );

  if (!result?.email) {
    throw new Error(PHONE_LOGIN_NOT_FOUND_ERROR);
  }

  return result.email;
}

/** Cached session user. Works offline after a Cognito sign-in. */
export async function getStoredAuthUser(): Promise<StoredAuthUser | null> {
  return readStoredUser();
}

export async function assertActiveAccount(userId: string): Promise<boolean> {
  try {
    const profile = await backendFetch<{ id: string; status?: string }>("/auth/me");
    if (profile?.id === userId && profile.status && profile.status !== "active") {
      await signOut();
      return false;
    }
    return true;
  } catch {
    // Don't force a logout if the profile check failed (offline / timeout).
    return true;
  }
}
