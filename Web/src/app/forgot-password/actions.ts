"use server";

import {
  INVALID_LOGIN_IDENTIFIER_ERROR,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import { lookupLoginEmailByPhone } from "@/app/auth/actions";

/** Sends a password reset email. Says nothing about whether the account exists. */
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

  const error = await sendPasswordResetEmail(email);

  if (error) {
    console.error("requestPasswordReset:", error.message);
    if (error.status === 429) {
      return { error: "Too many reset requests. Wait a minute and try again." };
    }
    return { error: "Could not send the reset email. Try again in a moment." };
  }

  return {};
}
