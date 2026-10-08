import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function getPortalRole(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return data?.role ?? "";
}
