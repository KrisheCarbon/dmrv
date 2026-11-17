"use server";

import {
  INVALID_LOGIN_IDENTIFIER_ERROR,
  PHONE_LOGIN_EMAIL_DOMAIN,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { lookupLoginEmailByPhone } from "@/app/auth/actions";
import { CognitoRequestError, confirmForgotPassword } from "@/lib/cognitoApi";
import { sendPasswordResetEmail } from "@/lib/passwordReset";

async function resolveResetEmail(identifier: string): Promise<
  { email: string } | { error: string } | { missing: true }
> {
  const parsed = parseLoginIdentifier(identifier);
  if (parsed.kind !== "email" && parsed.kind !== "phone") {
    return { error: INVALID_LOGIN_IDENTIFIER_ERROR };
  }

  const email =
    parsed.kind === "email"
      ? parsed.email
      : await lookupLoginEmailByPhone(parsed.phone);
  if (!email) return { missing: true };
  if (email.endsWith(`@${PHONE_LOGIN_EMAIL_DOMAIN}`)) {
    return {
      error: "This account has no email inbox. Ask your admin to set a password.",
    };
  }
  return { email };
}

/** Sends a password reset code. Says nothing about whether the account exists. */
export async function requestPasswordReset(
  identifier: string,
): Promise<{ error?: string }> {
  const resolved = await resolveResetEmail(identifier);
  if ("error" in resolved) return { error: resolved.error };
  if ("missing" in resolved) return {};

  const error = await sendPasswordResetEmail(resolved.email);
  if (error) {
    console.error("requestPasswordReset:", error.message);
    if (error.status === 429 || /no email inbox/i.test(error.message)) {
      return { error: error.message };
    }
    return { error: "Could not send the reset email. Try again in a moment." };
  }

  return {};
}

/** Confirms the emailed code and stores the new password in Cognito. */
export async function confirmPasswordReset(
  identifier: string,
  code: string,
  password: string,
): Promise<{ error?: string }> {
  const confirmation = code.trim();
  if (!/^\d{6,8}$/.test(confirmation)) {
    return { error: "Enter the code from the email." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const resolved = await resolveResetEmail(identifier);
  if ("error" in resolved) return { error: resolved.error };
  if ("missing" in resolved) {
    return { error: "That code doesn't match. Request a new one." };
  }

  try {
    await confirmForgotPassword(resolved.email, confirmation, password);
    return {};
  } catch (error) {
    if (error instanceof CognitoRequestError) return { error: error.message };
    return { error: "Could not update the password. Try again." };
  }
}
