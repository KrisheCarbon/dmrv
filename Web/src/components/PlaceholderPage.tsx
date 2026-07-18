import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface PlaceholderPageProps {
  title: string;
  description: string;
  section: string;
  relatedLinks?: { href: string; label: string }[];
}

export default function PlaceholderPage({
  title,
  description,
  section,
  relatedLinks = [],
}: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={title}
        description={description}
        badge="UI preview"
      />

      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 sm:p-12">
        <div className="mx-auto max-w-lg text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-dark/8 text-brand-dark text-2xl">
            ◌
          </div>
          <h2 className="text-lg Sbold text-gray-900">Coming soon</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            The <span className="font-medium text-gray-700">{title}</span> module
            is part of the <span className="font-medium text-gray-700">{section}</span>{" "}
            section. Layout and navigation are ready — data and actions will be
            connected in a later phase.
          </p>
        </div>
      </div>

      {relatedLinks.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm uppercase tracking-wide text-gray-500">
            Related in {section}
          </h3>
          <div className="flex flex-wrap gap-2">
            {relatedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-brand-dark/30 hover:bg-gray-50 transition"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
