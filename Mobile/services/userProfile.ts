import { formatRoleLabel, type UserRole } from "@krishecarbon/shared";
import { supabase } from "./supabase";
import { getStoredAuthUser } from "./auth";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole | string;
  role_label: string;
  email?: string | null;
  phone?: string | null;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getStoredAuthUser();
  if (!user) return null;

  const fallbackName =
    user.user_metadata?.full_name?.trim() ||
    user.user_metadata?.name?.trim() ||
    user.email?.split("@")[0] ||
    "User";

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "climapreneur";

  return {
    id: user.id,
    full_name: profile?.full_name?.trim() || fallbackName,
    role,
    role_label: formatRoleLabel(role),
    email: profile?.email ?? user.email ?? null,
    phone: profile?.phone ?? null,
  };
}
