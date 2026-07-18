import type { PyrolysisBatchStatusValue } from "@krishecarbon/shared";

const TONE_CLASSES = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
} as const;

export default function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

export function ReviewStatusBadge({
  tone,
  label,
}: {
  status?: PyrolysisBatchStatusValue;
  tone: keyof typeof TONE_CLASSES;
  label: string;
}) {
  return <StatusBadge label={label} tone={tone} />;
}
