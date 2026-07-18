import { redirect } from "next/navigation";
import Link from "next/link";
import StatusCard from "@/components/StatusCard";
import DashboardSectionCard from "@/components/DashboardSectionCard";
import DashboardSensorData from "@/components/sensor/DashboardSensorData";
import { getDashboardSectionsForRole } from "@/lib/nav-helpers";
import { canAccessNetwork, formatRoleLabel } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

/** Sample placeholders until live MRV / payout data is wired up. */
const DASHBOARD_PLACEHOLDER_METRICS = {
  carbonSequesteredT: "1,248",
  biocharProducedT: "892",
  biomassAvailableT: "3,450",
  activeProductionSites: 24,
  climapreneursActive: 18,
  climapreneurEarnings: "₹12.4L",
} as const;

export default async function Home() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("Failed to load profile");
  }

  const dashboardSections = getDashboardSectionsForRole(profile.role);
  const showNetworkQuickActions = canAccessNetwork(profile.role);
  const metrics = DASHBOARD_PLACEHOLDER_METRICS;

  return (
    <div className="space-y-10">
      <div className="space-y-1.5">
        <h2 className="text-2xl Sbold text-gray-900">
          Welcome, {profile.full_name}
        </h2>
        <p className="text-sm text-gray-500">
          {formatRoleLabel(profile.role)} portal — KrisheCarbon DMRV operations
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm uppercase tracking-wide text-gray-500">
          At a glance
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatusCard
            label="Carbon sequestered"
            value={`${metrics.carbonSequesteredT} t`}
            hint="Coming soon"
          />
          <StatusCard
            label="Biochar produced"
            value={`${metrics.biocharProducedT} t`}
            hint="Coming soon"
          />
          <StatusCard
            label="Biomass still available"
            value={`${metrics.biomassAvailableT} t`}
            hint="Coming soon"
          />
          <StatusCard
            label="Active production sites"
            value={metrics.activeProductionSites}
            hint="Coming soon"
          />
          <StatusCard
            label="Climapreneurs active"
            value={metrics.climapreneursActive}
            hint="Coming soon"
          />
          <StatusCard
            label="Climapreneur earnings"
            value={metrics.climapreneurEarnings}
            hint="Coming soon"
          />
        </div>
      </section>

      {showNetworkQuickActions ? <DashboardSensorData /> : null}

      <section className="space-y-4">
        <h3 className="text-sm uppercase tracking-wide text-gray-500">
          Modules
        </h3>
        <div className="grid gap-6 lg:grid-cols-2">
          {dashboardSections.map((section) => (
            <DashboardSectionCard
              key={section.key}
              title={section.title}
              description={section.description}
              href={section.href}
              links={section.links}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-brand-dark/15 bg-brand-dark p-6 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-white/70 uppercase tracking-wide">
              Quick actions
            </p>
            <p className="text-base Smedium">
              Jump to the most used areas of the portal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showNetworkQuickActions ? (
              <>
                <Link
                  href="/network/biochar-producers"
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition"
                >
                  Producers
                </Link>
                <Link
                  href="/network/farms"
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition"
                >
                  Farms
                </Link>
              </>
            ) : null}
            <Link
              href="/operations/intents"
              className="rounded-lg bg-brand-green px-4 py-2 text-sm text-brand-dark Sbold hover:opacity-90 transition"
            >
              Intents
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
