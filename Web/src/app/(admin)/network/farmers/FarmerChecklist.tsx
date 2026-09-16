import type { SoilSampleTone } from "@krishecarbon/shared";
import { sampleToneToChecklist } from "./farmerLib";

type MarkTone = "ok" | "warn" | "error" | "none";

function Mark({
  label,
  done,
  tone,
}: {
  label: string;
  done?: boolean;
  tone?: MarkTone;
}) {
  const resolved: MarkTone = tone ?? (done ? "ok" : "none");
  const filled = resolved !== "none";
  const circle =
    resolved === "ok"
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : resolved === "warn"
        ? "border-amber-500 bg-amber-50 text-amber-700"
        : resolved === "error"
          ? "border-red-500 bg-red-50 text-red-700"
          : "border-neutral-300 bg-white text-transparent";
  const text =
    resolved === "ok"
      ? "text-emerald-800"
      : resolved === "warn"
        ? "text-amber-800"
        : resolved === "error"
          ? "text-red-700"
          : "text-neutral-500";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${text}`}>
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] font-semibold leading-none ${circle}`}
        aria-hidden
      >
        {filled ? "✓" : ""}
      </span>
      {label}
    </span>
  );
}

export default function FarmerChecklist({
  hasCompleteProfile,
  hasFarms,
  sampleTone,
  hasReport,
  hasConsent,
}: {
  hasCompleteProfile?: boolean;
  hasFarms: boolean;
  sampleTone: SoilSampleTone;
  hasReport: boolean;
  hasConsent?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <Mark
        tone={hasCompleteProfile === false ? "warn" : "ok"}
        label="Farmer"
      />
      <Mark done={hasFarms} label="Farms" />
      <Mark tone={sampleToneToChecklist(sampleTone)} label="Sample" />
      <Mark done={hasReport} label="Report" />
      {hasConsent !== undefined ? (
        <Mark done={hasConsent} label="Consent" />
      ) : null}
    </div>
  );
}
