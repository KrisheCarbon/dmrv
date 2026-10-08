import SectionOverview from "@/components/SectionOverview";
import { isDmrvViewer } from "@/lib/roles";
import { getPortalRole } from "@/lib/portalRole";

export default async function BiocharOverviewPage() {
  const role = await getPortalRole();
  return (
    <SectionOverview
      section="Biochar"
      role={role}
      description={
        isDmrvViewer(role)
          ? "Pyrolysis, sensor data, mixing, and feedstock lab reports."
          : "Production runs, mixing, application, fuel, feedstock, and sensor data."
      }
    />
  );
}
