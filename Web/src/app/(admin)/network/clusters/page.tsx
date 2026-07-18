import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function ClustersPage() {
  return (
    <PlaceholderPage
      title="Clusters"
      description="Manage village clusters, crop coverage, and biochar potential across regions."
      section="Network"
      relatedLinks={getSectionLinks("Network")}
    />
  );
}
