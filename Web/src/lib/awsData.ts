import { createAwsDataClient } from "@/lib/awsDataClient";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function serverData() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }
  return createAwsDataClient(session.access_token);
}
