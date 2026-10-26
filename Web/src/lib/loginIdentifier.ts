import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INVALID_LOGIN_IDENTIFIER_ERROR,
  PHONE_LOGIN_NOT_FOUND_ERROR,
  parseLoginIdentifier,
} from "@krishecarbon/shared";
import { lookupLoginEmailByPhone } from "@/app/auth/actions";

export async function resolvePasswordLoginEmail(
  _supabase: SupabaseClient,
  identifier: string,
): Promise<string> {
  const parsed = parseLoginIdentifier(identifier);
  if (parsed.kind === "email") return parsed.email;
  if (parsed.kind !== "phone") {
    throw new Error(INVALID_LOGIN_IDENTIFIER_ERROR);
  }

  const email = await lookupLoginEmailByPhone(parsed.phone);
  if (!email) {
    throw new Error(PHONE_LOGIN_NOT_FOUND_ERROR);
  }

  return email;
}
