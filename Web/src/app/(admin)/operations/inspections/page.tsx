import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function OperationsInspectionsPage() {
  return (
    <PlaceholderPage
      title="Inspections"
      description="Plan and document site inspections — announced and unannounced field visits."
      section="Operations"
      relatedLinks={getSectionLinks("Operations")}
    />
  );
}
