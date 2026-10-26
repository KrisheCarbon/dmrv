import { backendFetch } from "@/lib/backendApi";

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

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  return backendFetch<DashboardCounts>("/dashboard/counts");
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
    Farmers: counts.farms,
  };
}
