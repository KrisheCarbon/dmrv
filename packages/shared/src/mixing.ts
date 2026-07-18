import type { FieldPhotoMetadata } from "./pyrolysis";
import type {
  MixingEntryReviewStatus,
  MixingEntryStatusRecord,
} from "./mixingEntryStatus";

export const MIXING_MATERIAL_TYPES = [
  "biological_matrix_compost",
  "biochar_based_fertilizer",
  "solid_manure",
  "liquid_manure",
] as const;

export type MixingMaterialType = (typeof MIXING_MATERIAL_TYPES)[number];

export const MIXING_MATERIAL_LABELS: Record<MixingMaterialType, string> = {
  biological_matrix_compost: "Biological matrix compost",
  biochar_based_fertilizer: "Biochar based fertilizer",
  solid_manure: "Solid manure",
  liquid_manure: "Liquid manure",
};

export function mixingMaterialLabel(type: MixingMaterialType | string): string {
  return MIXING_MATERIAL_LABELS[type as MixingMaterialType] ?? type;
}

export const MIXING_ENTRY_SUBMISSION_STATUS = ["submitted"] as const;
export type MixingEntrySubmissionStatus =
  (typeof MIXING_ENTRY_SUBMISSION_STATUS)[number];

export interface MixingPyrolysisLinkRecord {
  pyrolysis_batch_id: string;
  kontikki_code?: string | null;
  batch_number?: string | null;
  producer_name?: string | null;
}

export interface MixingEntryRecord {
  id: string;
  operator_id: string;
  started_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  material_type?: MixingMaterialType | null;
  material_to_biochar_ratio?: number | null;
  comment?: string | null;
  biochar_photo_url?: string | null;
  biochar_photo_metadata?: FieldPhotoMetadata | null;
  substrate_photo_url?: string | null;
  substrate_photo_metadata?: FieldPhotoMetadata | null;
  mixing_photo_url?: string | null;
  mixing_photo_metadata?: FieldPhotoMetadata | null;
  status: MixingEntrySubmissionStatus;
  entry_status?: MixingEntryStatusRecord | null;
  pyrolysis_links: MixingPyrolysisLinkRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface AvailableMixingPyrolysisBatch {
  id: string;
  batch_number?: string | null;
  kontikki_id: string;
  kontikki_code: string;
  producer_id?: string | null;
  producer_name?: string | null;
  session_completed_at?: string | null;
  yield_percent?: number | null;
}

/** Mixing entry row shown on a pyrolysis batch detail page. */
export interface PyrolysisBatchMixingEntrySummary {
  id: string;
  started_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  material_type?: MixingMaterialType | null;
  material_to_biochar_ratio?: number | null;
  operator_name: string;
  review_status: MixingEntryReviewStatus;
}

export interface CreateMixingEntryPayload {
  started_at: string;
  farm_id?: string | null;
  farm_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  material_type: MixingMaterialType;
  material_to_biochar_ratio?: number | null;
  comment?: string | null;
  biochar_photo_url?: string | null;
  biochar_photo_metadata?: FieldPhotoMetadata | null;
  substrate_photo_url?: string | null;
  substrate_photo_metadata?: FieldPhotoMetadata | null;
  mixing_photo_url?: string | null;
  mixing_photo_metadata?: FieldPhotoMetadata | null;
  pyrolysis_batch_ids: string[];
}
