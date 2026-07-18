import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function NetworkSupervisorsPage() {
  return (
    <PlaceholderPage
      title="Supervisors"
      description="Manage supervisor accounts, assignments, and coverage across clusters and villages."
      section="Network"
      relatedLinks={getSectionLinks("Network")}
    />
  );
}
