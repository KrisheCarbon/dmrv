import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function BiocharFuelPage() {
  return (
    <PlaceholderPage
      title="Fuel"
      description="Monitor feedstock fuel use, energy inputs, and efficiency across production sites."
      section="Biochar"
      relatedLinks={getSectionLinks("Biochar")}
    />
  );
}
