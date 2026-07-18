import Link from "next/link";
import PageHeader from "@/components/PageHeader";

const CARBON_MODULES = [
  {
    title: "Carbon registry",
    description: "Issued credits, retirements, and registry sync status.",
    href: "#",
    status: "Planned",
  },
  {
    title: "Removals & MRV",
    description: "Measured removals, verification workflows, and audit trail.",
    href: "#",
    status: "Planned",
  },
  {
    title: "Reporting",
    description: "Exportable reports for partners, auditors, and buyers.",
    href: "#",
    status: "Planned",
  },
  {
    title: "Methodology",
    description: "Applied methodologies, versions, and project boundaries.",
    href: "#",
    status: "Planned",
  },
];

export default function CarbonPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Carbon"
        description="Credits, removals, and MRV reporting for KrisheCarbon programmes."
        badge="UI preview"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {CARBON_MODULES.map((module) => (
          <div
            key={module.title}
            className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base Sbold text-gray-900">{module.title}</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {module.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">{module.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
        Carbon data layers will connect to production, application, and network
        modules.{" "}
        <Link href="/biochar/production" className="text-brand-dark font-medium hover:underline">
          Biochar production
        </Link>{" "}
        and{" "}
        <Link href="/network/farms" className="text-brand-dark font-medium hover:underline">
          farms
        </Link>{" "}
        will feed into this section.
      </div>
    </div>
  );
}
