import {
  isFarmerProfileComplete,
  soilSampleToneFromStatuses,
  soilTestStatusLabel,
  type FarmerConsentRecord,
  type FarmFieldRecord,
  type SoilSampleTone,
  type SoilTestRecord,
} from "@krishecarbon/shared";

export interface FarmerChecklistState {
  hasCompleteProfile: boolean;
  hasFarms: boolean;
  farmCount: number;
  sampleTone: SoilSampleTone;
  sampleLabel: string;
  hasReport: boolean;
  hasConsent: boolean;
}

export function sampleToneToChecklist(
  tone: SoilSampleTone,
): "ok" | "warn" | "error" | "none" {
  if (tone === "accepted") return "ok";
  if (tone === "rejected") return "error";
  if (tone === "collected") return "warn";
  return "none";
}

export function sampleToneLabel(tone: SoilSampleTone): string {
  if (tone === "accepted") return "Accepted";
  if (tone === "rejected") return "Rejected";
  if (tone === "collected") return "Collected";
  return "Not collected";
}

export function sampleToneClass(tone: SoilSampleTone): string {
  if (tone === "accepted") return "text-emerald-800";
  if (tone === "rejected") return "text-red-700";
  if (tone === "collected") return "text-amber-800";
  return "text-neutral-500";
}

export function consentExpiryLabel(
  consent:
    | { valid_to?: string | null; consent_status?: string | null }
    | null
    | undefined,
): string {
  if (!consent) return "No consent";
  if (!consent.valid_to) return consent.consent_status || "Active";
  const today = new Date().toISOString().slice(0, 10);
  if (consent.valid_to < today) return `Expired ${consent.valid_to}`;
  return `Active until ${consent.valid_to}`;
}

export function buildFarmerChecklist(
  fields: FarmFieldRecord[],
  tests: SoilTestRecord[],
  consents: FarmerConsentRecord[] = [],
  farmer?: Parameters<typeof isFarmerProfileComplete>[0],
): FarmerChecklistState {
  const statuses = tests.map((test) => test.status);
  const sampleTone = soilSampleToneFromStatuses(statuses);
  const latest = tests[0];
  return {
    hasCompleteProfile: farmer ? isFarmerProfileComplete(farmer) : true,
    hasFarms: fields.length > 0,
    farmCount: fields.length,
    sampleTone,
    sampleLabel: latest
      ? soilTestStatusLabel(latest.status)
      : sampleToneLabel(sampleTone),
    hasReport: tests.some(
      (test) =>
        (test.reports?.length ?? 0) > 0 || test.status === "reported",
    ),
    hasConsent: consents.length > 0,
  };
}
