import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const { supabaseUrl, supabaseAnonKey } =
  Constants.expoConfig.extra;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase env vars missing");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);
