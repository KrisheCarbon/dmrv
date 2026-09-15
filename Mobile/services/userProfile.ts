import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatRoleLabel, type UserRole } from "@krishecarbon/shared";
import { supabase } from "./supabase";
import { getStoredAuthUser } from "./auth";

const PROFILE_CACHE_KEY = "dmrv_user_profile";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole | string;
  role_label: string;
  email?: string | null;
  phone?: string | null;
}

export async function clearUserProfileCache() {
  await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
}

async function readCachedProfile(userId: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return parsed.id === userId ? parsed : null;
  } catch {
    return null;
  }
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getStoredAuthUser();
  if (!user) {
    await clearUserProfileCache();
    return null;
  }

  const fallbackName =
    user.user_metadata?.full_name?.trim() ||
    user.user_metadata?.name?.trim() ||
    user.email?.split("@")[0] ||
    "User";

  const cached = await readCachedProfile(user.id);

  try {
    const { data: profile } = await supabase
      .from("users")
      .select("full_name, role, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const role =
      profile?.role ||
      cached?.role ||
      user.user_metadata?.role ||
      user.app_metadata?.role ||
      "climapreneur";

    const result: UserProfile = {
      id: user.id,
      full_name: profile?.full_name?.trim() || cached?.full_name || fallbackName,
      role,
      role_label: formatRoleLabel(role),
      email: profile?.email ?? cached?.email ?? user.email ?? null,
      phone: profile?.phone ?? cached?.phone ?? null,
    };

    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(result));
    return result;
  } catch {
    if (cached) return cached;

    const role = user.user_metadata?.role || user.app_metadata?.role || "climapreneur";
    return {
      id: user.id,
      full_name: fallbackName,
      role,
      role_label: formatRoleLabel(role),
      email: user.email ?? null,
      phone: null,
    };
  }
}
