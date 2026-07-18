import type { Session, SupabaseClient } from "@supabase/supabase-js";

export async function establishSessionFromUrl(
  supabase: SupabaseClient
): Promise<Session | null> {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) throw error;

  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search
  );

  return data.session;
}
