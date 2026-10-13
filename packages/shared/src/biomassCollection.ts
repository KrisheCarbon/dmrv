import type { FieldPhotoMetadata } from "./pyrolysis";

/** Shown beside both photos in the app and on the portal. */
export const BIOMASS_COLLECTION_TRACTOR_NOTICE =
  "The tractor number must be clearly visible in this photo.";

export const BIOMASS_COLLECTION_STATUSES = ["submitted"] as const;

export type BiomassCollectionStatus = (typeof BIOMASS_COLLECTION_STATUSES)[number];

export interface BiomassCollectionRecord {
  id: string;
  operator_id: string;
  operator_name?: string | null;
  farm_id?: string | null;
  farm_name?: string | null;
  producer_id?: string | null;
  producer_name?: string | null;
  tractor_number?: string | null;
  loaded_at: string;
  loaded_photo_url: string;
  loaded_photo_metadata?: FieldPhotoMetadata | null;
  unloaded_at: string;
  unloaded_photo_url: string;
  unloaded_photo_metadata?: FieldPhotoMetadata | null;
  status: BiomassCollectionStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CreateBiomassCollectionPayload {
  farm_id: string;
  farm_name?: string | null;
  producer_id: string;
  producer_name?: string | null;
  tractor_number?: string | null;
  loaded_at: string;
  loaded_photo_url: string;
  loaded_photo_metadata?: FieldPhotoMetadata | null;
  unloaded_at: string;
  unloaded_photo_url: string;
  unloaded_photo_metadata?: FieldPhotoMetadata | null;
}
