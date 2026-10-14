"use server";

import { createClient } from "@supabase/supabase-js";
import {
  INVALID_LOGIN_IDENTIFIER_ERROR,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getSiteUrl } from "@/lib/siteUrl";
import { lookupLoginEmailByPhone } from "@/app/auth/actions";

/**
 * Sends a password reset email. Runs on the server with the implicit flow so the
 * link carries its own tokens and works on any device, not only the browser that
 * asked for it. Says nothing about whether the account exists.
 */
export async function requestPasswordReset(
  identifier: string,
): Promise<{ error?: string }> {
  const parsed = parseLoginIdentifier(identifier);
  if (parsed.kind !== "email" && parsed.kind !== "phone") {
    return { error: INVALID_LOGIN_IDENTIFIER_ERROR };
  }

  const email =
    parsed.kind === "email"
      ? parsed.email
      : await lookupLoginEmailByPhone(parsed.phone);
  if (!email) return {};

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false },
  });

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/reset-password`,
  });

  if (error) {
    console.error("requestPasswordReset:", error.message);
    if (error.status === 429) {
      return { error: "Too many reset requests. Wait a minute and try again." };
    }
    return { error: "Could not send the reset email. Try again in a moment." };
  }

  return {};
}
