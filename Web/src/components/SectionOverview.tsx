import PageHeader from "@/components/PageHeader";
import OverviewStatCard from "@/components/OverviewStatCard";
import { getNavGroup, getSubsectionLinks } from "@/lib/nav-helpers";

interface SectionOverviewProps {
  section: string;
  description: string;
  stats?: Record<string, string | number>;
}

export default function SectionOverview({
  section,
  description,
  stats = {},
}: SectionOverviewProps) {
  const group = getNavGroup(section);
  const links = getSubsectionLinks(section);

  return (
    <div className="space-y-8">
      <PageHeader title={group?.label ?? section} description={description} />

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-wide text-gray-500">
          At a glance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {links.map((link) => (
            <OverviewStatCard
              key={link.href}
              label={link.label}
              value={stats[link.label] ?? "—"}
              href={link.href}
              hint={`Open ${link.label.toLowerCase()}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
