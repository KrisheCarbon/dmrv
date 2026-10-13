import SectionOverview from "@/components/SectionOverview";
import {
  fetchDashboardCounts,
  networkOverviewStats,
} from "@/lib/dashboardStats";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getPortalRole } from "@/lib/portalRole";
import { isDmrvViewer } from "@/lib/roles";

export default async function NetworkOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const [counts, role] = await Promise.all([fetchDashboardCounts(supabase), getPortalRole()]);
  const viewer = isDmrvViewer(role);
  const stats = networkOverviewStats(counts);
  if (viewer) {
    // dMRV viewers do not see the people modules, so their counts are left out too.
    delete stats.Supervisors;
    delete stats.Climapreneurs;
  }

  return (
    <SectionOverview
      section="Network"
      role={viewer ? role : undefined}
      description={
        viewer
          ? "Partners, producers, clusters, kontikkis, and farmers."
          : "Partners, producers, clusters, kontikkis, supervisors, climapreneurs, and farmers."
      }
      stats={stats}
    />
  );
}
