import {
  MOISTURE_READING_COUNT,
  PYROLYSIS_KONTIKKI_SECTIONS,
  PYROLYSIS_STAGE_KEYS,
  pyrolysisWorkflowSectionLabel,
  type PyrolysisKontikkiWorkflowSection,
} from "./pyrolysis";

export const PYROLYSIS_BATCH_STATUS_VALUES = [
  "pending",
  "accepted",
  "rejected",
  "on_hold",
] as const;

export type PyrolysisBatchStatusValue =
  (typeof PYROLYSIS_BATCH_STATUS_VALUES)[number];

export const PYROLYSIS_BATCH_STATUS_FLAG_VALUES = [
  "accepted",
  "rejected",
  "on_hold",
] as const;

export type PyrolysisBatchStatusFlagValue =
  (typeof PYROLYSIS_BATCH_STATUS_FLAG_VALUES)[number];

export const PYROLYSIS_BATCH_STATUS_TARGET_TYPES = ["section", "photo"] as const;

export type PyrolysisBatchStatusTargetType =
  (typeof PYROLYSIS_BATCH_STATUS_TARGET_TYPES)[number];

export const PYROLYSIS_BATCH_STATUS_SECTION_KEYS = PYROLYSIS_KONTIKKI_SECTIONS;

export type PyrolysisBatchStatusSectionKey = PyrolysisKontikkiWorkflowSection;

export const PYROLYSIS_BATCH_STATUS_PHOTO_KEYS = [
  "feedstock_photo",
  "feedstock_size_photo",
  ...Array.from(
    { length: MOISTURE_READING_COUNT },
    (_, index) => `moisture_photo_${index + 1}`,
  ),
  ...PYROLYSIS_STAGE_KEYS.map((stage) => `stage_${stage}`),
] as const;

export type PyrolysisBatchStatusPhotoKey =
  (typeof PYROLYSIS_BATCH_STATUS_PHOTO_KEYS)[number];

export interface PyrolysisBatchStatusFlag {
  id?: string;
  target_type: PyrolysisBatchStatusTargetType;
  target_key: string;
  status: PyrolysisBatchStatusFlagValue;
  notes?: string | null;
}

export interface PyrolysisBatchStatusRecord {
  id: string;
  batch_id: string;
  status: PyrolysisBatchStatusValue;
  reviewer_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  flags?: PyrolysisBatchStatusFlag[];
  reviewer?: {
    id: string;
    full_name?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubmitPyrolysisBatchStatusPayload {
  status: Exclude<PyrolysisBatchStatusValue, "pending">;
  reviewer_notes?: string | null;
  flags: PyrolysisBatchStatusFlag[];
}

export interface UpdatePyrolysisBatchYieldPayload {
  yield_percent: number;
}

const PHOTO_KEY_LABELS: Record<PyrolysisBatchStatusPhotoKey, string> = {
  feedstock_photo: "Feedstock photo",
  feedstock_size_photo: "Feedstock size photo",
  moisture_photo_1: "Moisture photo 1",
  moisture_photo_2: "Moisture photo 2",
  moisture_photo_3: "Moisture photo 3",
  moisture_photo_4: "Moisture photo 4",
  moisture_photo_5: "Moisture photo 5",
  stage_initial: "Initial stage photo",
  stage_middle: "Middle stage photo",
  stage_final: "Final stage photo",
  stage_quenching: "Quenching photo",
};

export function isPyrolysisBatchStatusSectionKey(
  value: string,
): value is PyrolysisBatchStatusSectionKey {
  return (PYROLYSIS_BATCH_STATUS_SECTION_KEYS as readonly string[]).includes(value);
}

export function isPyrolysisBatchStatusPhotoKey(
  value: string,
): value is PyrolysisBatchStatusPhotoKey {
  return (PYROLYSIS_BATCH_STATUS_PHOTO_KEYS as readonly string[]).includes(value);
}

export function pyrolysisBatchStatusPhotoLabel(key: string): string {
  if (isPyrolysisBatchStatusPhotoKey(key)) return PHOTO_KEY_LABELS[key];
  return key;
}

export function pyrolysisBatchStatusSectionLabel(key: string): string {
  if (isPyrolysisBatchStatusSectionKey(key)) {
    return pyrolysisWorkflowSectionLabel(key);
  }
  return key;
}

export function pyrolysisBatchStatusValueLabel(
  status: PyrolysisBatchStatusValue,
): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "on_hold":
      return "On hold";
    default:
      return status;
  }
}

export function pyrolysisBatchStatusFlagValueLabel(
  status: PyrolysisBatchStatusFlagValue,
): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "on_hold":
      return "On hold";
    default:
      return status;
  }
}

export function photosForBatchStatusSection(
  section: PyrolysisBatchStatusSectionKey,
): PyrolysisBatchStatusPhotoKey[] {
  if (section === "info") {
    return ["feedstock_photo", "feedstock_size_photo"];
  }
  if (section === "moisture") {
    return PYROLYSIS_BATCH_STATUS_PHOTO_KEYS.filter((key) =>
      key.startsWith("moisture_photo_"),
    ) as PyrolysisBatchStatusPhotoKey[];
  }
  if (section === "yield") return [];
  return [`stage_${section}` as PyrolysisBatchStatusPhotoKey];
}
