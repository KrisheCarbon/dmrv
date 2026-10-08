import SectionOverview from "@/components/SectionOverview";
import { isDmrvViewer } from "@/lib/roles";
import { getPortalRole } from "@/lib/portalRole";

export default async function OperationsOverviewPage() {
  const role = await getPortalRole();
  return (
    <SectionOverview
      section="Operations"
      role={role}
      description={
        isDmrvViewer(role)
          ? "Training records."
          : "Trainings, inspections, intents, queries, and field updates."
      }
    />
  );
}
