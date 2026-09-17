"use server";

import { createClient } from "@supabase/supabase-js";
import { toLocalIndianMobile } from "@krishecarbon/shared";
import { getServiceRoleKey, supabaseUrl } from "@/lib/env";

const admin = createClient(supabaseUrl, getServiceRoleKey());

export async function lookupLoginEmailByPhone(
  phone: string,
): Promise<string | null> {
  const local = toLocalIndianMobile(phone);
  if (!/^[6-9]\d{9}$/.test(local)) return null;

  const { data, error } = await admin
    .from("users")
    .select("email, phone, status");

  if (error) {
    console.error("lookupLoginEmailByPhone:", error.message);
    return null;
  }

  const matches = (data ?? []).filter(
    (user) =>
      user.status !== "disabled" &&
      user.phone &&
      user.email &&
      toLocalIndianMobile(user.phone) === local,
  );

  if (matches.length !== 1) return null;
  return matches[0].email ?? null;
}
