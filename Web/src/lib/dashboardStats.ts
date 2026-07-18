import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardCounts {
  producers: number;
  kontikkis: number;
  farms: number;
  supervisors: number;
  climapreneurs: number;
  pendingIntents: number;
  clusters: number;
  partners: number;
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  filters?: Array<{ column: string; value: string }>,
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });

  for (const filter of filters ?? []) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;

  if (error) {
    console.error(`dashboardStats: failed to count ${table}`, error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchDashboardCounts(
  supabase: SupabaseClient,
): Promise<DashboardCounts> {
  const [
    producers,
    kontikkis,
    farms,
    supervisors,
    climapreneurs,
    pendingIntents,
    clusters,
    partners,
  ] = await Promise.all([
    countRows(supabase, "biochar_producers"),
    countRows(supabase, "kontikkis"),
    countRows(supabase, "farms"),
    countRows(supabase, "users", [{ column: "role", value: "supervisor" }]),
    countRows(supabase, "users", [{ column: "role", value: "climapreneur" }]),
    countRows(supabase, "roi_intents", [{ column: "status", value: "pending" }]),
    countRows(supabase, "clusters"),
    countRows(supabase, "partner_organizations"),
  ]);

  return {
    producers,
    kontikkis,
    farms,
    supervisors,
    climapreneurs,
    pendingIntents,
    clusters,
    partners,
  };
}

export function networkOverviewStats(
  counts: DashboardCounts,
): Record<string, number> {
  return {
    Producers: counts.producers,
    Kontikkis: counts.kontikkis,
    Clusters: counts.clusters,
    Partners: counts.partners,
    Supervisors: counts.supervisors,
    Climapreneurs: counts.climapreneurs,
    Farms: counts.farms,
  };
}
