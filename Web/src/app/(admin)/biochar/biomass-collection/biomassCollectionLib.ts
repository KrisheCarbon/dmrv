import type { BiomassCollectionRecord, FieldPhotoMetadata } from "@krishecarbon/shared";
import type { DbRow } from "@/types/entities";
import { buildSearchIndex, photoMetadataSearchParts } from "@/lib/searchIndex";

export interface BiomassCollectionTableRow extends DbRow {
  id: string;
  loaded: string;
  unloaded: string;
  farm_name: string;
  farm_id?: string | null;
  producer_name: string;
  tractor_number: string;
  operator_name: string;
  search_index: string;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/** Time between the loaded and unloaded photo watermarks. */
export function transitDuration(record: BiomassCollectionRecord): string | null {
  const start = Date.parse(record.loaded_photo_metadata?.captured_at ?? record.loaded_at);
  const end = Date.parse(record.unloaded_photo_metadata?.captured_at ?? record.unloaded_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export function mapsUrl(metadata: FieldPhotoMetadata) {
  return `https://www.google.com/maps?q=${metadata.latitude},${metadata.longitude}`;
}

export function biomassCollectionSearchIndex(record: BiomassCollectionRecord): string {
  return buildSearchIndex(
    record.id,
    record.farm_name,
    record.producer_name,
    record.tractor_number,
    record.operator_name,
    record.loaded_at,
    record.unloaded_at,
    formatDateTime(record.loaded_at),
    formatDateTime(record.unloaded_at),
    photoMetadataSearchParts(record.loaded_photo_metadata),
    photoMetadataSearchParts(record.unloaded_photo_metadata),
  );
}
