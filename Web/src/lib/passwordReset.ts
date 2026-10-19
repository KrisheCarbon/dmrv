import { createClient, type AuthError } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Emails a password reset link that opens /reset-password. Uses the implicit flow
 * so the link carries its own tokens and works on any device, not only the browser
 * that asked for it.
 */
export async function sendPasswordResetEmail(email: string): Promise<AuthError | null> {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false },
  });

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/reset-password`,
  });

  return error;
}
