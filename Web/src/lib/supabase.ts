import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
