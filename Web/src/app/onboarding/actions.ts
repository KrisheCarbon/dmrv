"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getServiceRoleKey, supabaseAnonKey, supabaseUrl } from "@/lib/env";

const admin = createClient(supabaseUrl, getServiceRoleKey());

export async function completeOnboarding({ userId }: { userId: string }) {
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
