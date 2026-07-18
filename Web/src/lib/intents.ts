import { supabase } from "@/lib/supabase";
import type { FetchIntentsResult, RoiIntent } from "@/types";

export async function fetchIntents({
  status = "all",
  queryType = "all",
}: {
  status?: string;
  queryType?: string;
} = {}): Promise<FetchIntentsResult> {
  let query = supabase
    .from("roi_intents")
    .select("*")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (queryType !== "all") {
    query = query.eq("query_type", queryType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchIntents error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, intents: (data ?? []) as RoiIntent[] };
}

export async function updateIntentStatus(
  intentId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from("roi_intents")
    .update({
      status,
      decision_at: new Date().toISOString(),
    })
    .eq("id", intentId);

  if (error) {
    console.error("updateIntentStatus error:", error);
    throw new Error(error.message);
  }
}
