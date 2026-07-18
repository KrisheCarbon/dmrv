import Link from "next/link";

interface OverviewStatCardProps {
  label: string;
  value: string | number;
  href: string;
  hint?: string;
}

export default function OverviewStatCard({
  label,
  value,
  href,
  hint,
}: OverviewStatCardProps) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:border-brand-dark/25 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
    >
      <div className="space-y-1">
        <p className="text-sm text-gray-500 Snormal">{label}</p>
        <p className="text-3xl Sbold text-gray-900 group-hover:text-brand-dark transition">
          {value}
        </p>
        {hint ? (
          <p className="pt-2 text-xs text-gray-400 group-hover:text-gray-500 transition">
            {hint}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
