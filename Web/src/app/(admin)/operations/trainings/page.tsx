import PlaceholderPage from "@/components/PlaceholderPage";
import { getSectionLinks } from "@/lib/nav-helpers";

export default function OperationsTrainingsPage() {
  return (
    <PlaceholderPage
      title="Trainings"
      description="Schedule and track field trainings, certifications, and completion records."
      section="Operations"
      relatedLinks={getSectionLinks("Operations")}
    />
  );
}
