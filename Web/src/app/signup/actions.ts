"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getServiceRoleKey, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { SignupCheckResult } from "@/types";

const admin = createClient(supabaseUrl, getServiceRoleKey());

export async function checkSignupEmail(
  email: string
): Promise<SignupCheckResult> {
  const { data, error } = await admin
    .from("users")
    .select("status")
    .ilike("email", email.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { allowed: false, reason: "not_found" };
  if (data.status === "disabled")
    return { allowed: false, reason: "disabled" };
  if (data.status === "active")
    return { allowed: false, reason: "already_active" };
  if (data.status === "pending_auth") return { allowed: true };

  return { allowed: false, reason: "unknown" };
}

export async function completeSignup({ userId }: { userId: string }) {
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    throw new Error("Unauthorized");
  }

  const { error } = await admin
    .from("users")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "pending_auth");

  if (error) throw new Error(error.message);
  return true;
}
