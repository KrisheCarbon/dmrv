import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function OperationsUpdatesPage() {
  return (
    <PlaceholderPage
      title="Updates"
      description="Broadcast operational updates, policy changes, and release notes to field teams."
      section="Operations"
      relatedLinks={getSectionLinks("Operations")}
    />
  );
}
