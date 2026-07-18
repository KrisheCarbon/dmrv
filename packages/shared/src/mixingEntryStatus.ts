export const MIXING_ENTRY_REVIEW_STATUS_VALUES = [
  "pending_review",
  "approved",
  "rejected",
  "on_hold",
] as const;

export type MixingEntryReviewStatus =
  (typeof MIXING_ENTRY_REVIEW_STATUS_VALUES)[number];

export const MIXING_ENTRY_REVIEW_DECISION_VALUES = [
  "approved",
  "rejected",
  "on_hold",
] as const;

export type MixingEntryReviewDecision =
  (typeof MIXING_ENTRY_REVIEW_DECISION_VALUES)[number];

export const MIXING_ENTRY_PHOTO_KEYS = [
  "biochar",
  "substrate",
  "mixing",
] as const;

export type MixingEntryPhotoKey = (typeof MIXING_ENTRY_PHOTO_KEYS)[number];

export interface MixingEntryPhotoFlag {
  photo_key: MixingEntryPhotoKey;
  flagged: boolean;
}

export interface MixingEntryStatusRecord {
  id: string;
  entry_id: string;
  status: MixingEntryReviewStatus;
  reviewer_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  photo_flags?: MixingEntryPhotoFlag[];
  reviewer?: {
    id: string;
    full_name?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubmitMixingEntryStatusPayload {
  status: MixingEntryReviewDecision;
  reviewer_notes?: string | null;
  photo_flags: MixingEntryPhotoFlag[];
}

const REVIEW_STATUS_LABELS: Record<MixingEntryReviewStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  on_hold: "On hold",
};

const PHOTO_KEY_LABELS: Record<MixingEntryPhotoKey, string> = {
  biochar: "Biochar",
  substrate: "Substrate",
  mixing: "Mixing",
};

export function mixingEntryReviewStatusLabel(
  status: MixingEntryReviewStatus | string,
): string {
  return REVIEW_STATUS_LABELS[status as MixingEntryReviewStatus] ?? status;
}

export function mixingEntryPhotoLabel(key: MixingEntryPhotoKey | string): string {
  return PHOTO_KEY_LABELS[key as MixingEntryPhotoKey] ?? key;
}

export function isMixingEntryPhotoKey(value: string): value is MixingEntryPhotoKey {
  return (MIXING_ENTRY_PHOTO_KEYS as readonly string[]).includes(value);
}
