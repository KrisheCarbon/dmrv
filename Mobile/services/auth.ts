import { supabase } from "./supabase";

/** Cached session user — works offline (unlike getUser(), which validates over the network). */
export async function getStoredAuthUser() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}
