import type { FieldPhotoMetadata } from "./pyrolysis";
import type { ApplicationEntryStatusRecord } from "./applicationEntryStatus";

export const APPLICATION_MEDIA_TYPES = ["photo", "video"] as const;

export type ApplicationMediaType = (typeof APPLICATION_MEDIA_TYPES)[number];

export const APPLICATION_ENTRY_SUBMISSION_STATUS = ["submitted"] as const;

export type ApplicationEntrySubmissionStatus =
  (typeof APPLICATION_ENTRY_SUBMISSION_STATUS)[number];

export interface ApplicationPyrolysisLinkRecord {
  pyrolysis_batch_id: string;
  kontikki_code?: string | null;
  batch_number?: string | null;
  producer_name?: string | null;
}

export interface ApplicationEntryRecord {
  id: string;
  operator_id: string;
  applied_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  comment?: string | null;
  media_type: ApplicationMediaType;
  media_url?: string | null;
  media_metadata?: FieldPhotoMetadata | null;
  status: ApplicationEntrySubmissionStatus;
  entry_status?: ApplicationEntryStatusRecord | null;
  pyrolysis_links: ApplicationPyrolysisLinkRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface AvailableApplicationPyrolysisBatch {
  id: string;
  batch_number?: string | null;
  kontikki_id: string;
  kontikki_code: string;
  producer_id?: string | null;
  producer_name?: string | null;
  session_completed_at?: string | null;
  yield_percent?: number | null;
}

export interface CreateApplicationEntryPayload {
  applied_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  comment?: string | null;
  media_type: ApplicationMediaType;
  media_url?: string | null;
  media_metadata?: FieldPhotoMetadata | null;
  pyrolysis_batch_ids: string[];
}

export function applicationMediaTypeLabel(type: ApplicationMediaType | string): string {
  return type === "video" ? "Video" : "Photo";
}
