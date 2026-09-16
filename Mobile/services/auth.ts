import { supabase } from "./supabase";

/** Cached session user — works offline (unlike getUser(), which validates over the network). */
export async function getStoredAuthUser() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

export async function assertActiveAccount(userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("users")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Don't force a logout if the profile check failed (offline / timeout).
    return true;
  }

  if (profile?.status === "active") return true;

  await supabase.auth.signOut();
  return false;
}
