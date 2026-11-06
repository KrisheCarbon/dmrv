import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { COGNITO_ID_COOKIE, isCognitoTokenCurrent } from "@/lib/cognitoSession";
import { cookies } from "next/headers";

/** Cognito ID token from this sign-in, or the Supabase session if that is what they used. */
export async function getPortalAccessToken(): Promise<string | null> {
  const cognito = (await cookies()).get(COGNITO_ID_COOKIE)?.value;
  if (isCognitoTokenCurrent(cognito)) return cognito ?? null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
