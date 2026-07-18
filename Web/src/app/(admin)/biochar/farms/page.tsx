import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function BiocharFarmsPage() {
  return (
    <PlaceholderPage
      title="Farms"
      description="Biochar-linked farm records — application history, acreage, and MRV linkage."
      section="Biochar"
      relatedLinks={getSectionLinks("Biochar")}
    />
  );
}
