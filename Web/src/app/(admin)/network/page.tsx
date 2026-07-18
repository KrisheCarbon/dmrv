import SectionOverview from "@/components/SectionOverview";
import {
  fetchDashboardCounts,
  networkOverviewStats,
} from "@/lib/dashboardStats";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function NetworkOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const counts = await fetchDashboardCounts(supabase);

  return (
    <SectionOverview
      section="Network"
      description="Partners, producers, clusters, kontikkis, supervisors, climapreneurs, and farms."
      stats={networkOverviewStats(counts)}
    />
  );
}
