import Link from "next/link";

interface DashboardSectionCardProps {
  title: string;
  description: string;
  href: string;
  links: readonly { href: string; label: string }[];
}

export default function DashboardSectionCard({
  title,
  description,
  href,
  links,
}: DashboardSectionCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="space-y-4">
        <div>
          <Link href={href} className="group">
            <h3 className="text-lg Sbold text-gray-900 group-hover:text-brand-dark transition">
              {title}
            </h3>
          </Link>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs Smedium text-gray-700 hover:bg-brand-dark/8 hover:text-brand-dark transition"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
