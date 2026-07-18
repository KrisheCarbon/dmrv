export const APPLICATION_ENTRY_REVIEW_STATUS_VALUES = [
  "pending_review",
  "approved",
  "rejected",
  "on_hold",
] as const;

export type ApplicationEntryReviewStatus =
  (typeof APPLICATION_ENTRY_REVIEW_STATUS_VALUES)[number];

export const APPLICATION_ENTRY_REVIEW_DECISION_VALUES = [
  "approved",
  "rejected",
  "on_hold",
] as const;

export type ApplicationEntryReviewDecision =
  (typeof APPLICATION_ENTRY_REVIEW_DECISION_VALUES)[number];

export const APPLICATION_ENTRY_MEDIA_KEYS = ["application"] as const;

export type ApplicationEntryMediaKey =
  (typeof APPLICATION_ENTRY_MEDIA_KEYS)[number];

export interface ApplicationEntryMediaFlag {
  media_key: ApplicationEntryMediaKey;
  flagged: boolean;
}

export interface ApplicationEntryStatusRecord {
  id: string;
  entry_id: string;
  status: ApplicationEntryReviewStatus;
  reviewer_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  media_flags?: ApplicationEntryMediaFlag[];
  reviewer?: {
    id: string;
    full_name?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubmitApplicationEntryStatusPayload {
  status: ApplicationEntryReviewDecision;
  reviewer_notes?: string | null;
  media_flags: ApplicationEntryMediaFlag[];
}

const REVIEW_STATUS_LABELS: Record<ApplicationEntryReviewStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  on_hold: "On hold",
};

export function applicationEntryReviewStatusLabel(
  status: ApplicationEntryReviewStatus | string,
): string {
  return REVIEW_STATUS_LABELS[status as ApplicationEntryReviewStatus] ?? status;
}

export function isApplicationEntryMediaKey(
  value: string,
): value is ApplicationEntryMediaKey {
  return (APPLICATION_ENTRY_MEDIA_KEYS as readonly string[]).includes(value);
}
