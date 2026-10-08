import type {
  PyrolysisBatchMixingEntrySummary,
  PyrolysisBatchStatusFlag,
  PyrolysisBatchStatusPhotoKey,
  PyrolysisBatchStatusValue,
  PyrolysisBatchRecord,
} from "@krishecarbon/shared";
import {
  pyrolysisBatchStatusValueLabel,
  pyrolysisBatchStatusFlagValueLabel,
} from "@krishecarbon/shared";
import type { DbRow } from "@/types/entities";
import { buildSearchIndex } from "@/lib/searchIndex";

export const PYROLYSIS_PHOTOS_BUCKET = "pyrolysis";

export interface PyrolysisBatchListItem extends DbRow {
  id: string;
  batch_number?: string | null;
  generated_batch_code?: string | null;
  kontikki_id: string;
  kontikki_code: string;
  session_id: string;
  session_status: string;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
  yield_percent?: number | null;
  pyrolysis_completed: boolean;
  review_status: PyrolysisBatchStatusValue;
  reviewed_at?: string | null;
  feedstock_name?: string | null;
  feedstock_id?: string | null;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  sample_id?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  comment?: string | null;
  reviewer_notes?: string | null;
  review_flag_text?: string[];
  moisture_readings?: (number | null)[];
  created_at?: string;
  updated_at?: string;
}

export interface PyrolysisSensorReading {
  time_offset_seconds: number;
  temperature: number;
  recorded_at: string;
  top_c: number | null;
  middle_c: number | null;
  bottom_c: number | null;
}

export interface PyrolysisSensorLog {
  id: string;
  batch_name: string;
  kiln_id: string;
  started_at: string;
  ended_at: string;
  clock: "sensor" | "phone";
  point_count: number;
  lowest_c: number | null;
  ends_excluded: boolean;
  stayed_at_or_above_350: boolean | null;
  readings: PyrolysisSensorReading[];
}

export interface RainbowMoistureProof {
  slot: number;
  reading: number | null;
  photo_url: string | null;
  captured_at: string | null;
}

export interface RainbowLayerProof {
  sequence: number;
  photo_url: string | null;
  captured_at: string | null;
}

export interface RainbowRunProof {
  feedstock_class: "woody" | "other" | null;
  required_moisture_count: number;
  moisture_mean: number | null;
  moisture_mean_limit: number | null;
  highest_moisture: number | null;
  moisture_within_rules: boolean;
  moisture: RainbowMoistureProof[];
  layers: RainbowLayerProof[];
  last_layer_confirmed: boolean;
  flame_curtain_photo_url: string | null;
  flame_curtain_captured_at: string | null;
  quench_start_photo_url: string | null;
  quench_start_captured_at: string | null;
  quench_end_photo_url: string | null;
  quench_end_captured_at: string | null;
  quench_photos?: Array<{
    slot: number;
    photo_url: string | null;
    captured_at: string | null;
  }>;
  quench_duration_seconds?: number | null;
  quench_video_url?: string | null;
  quench_video_captured_at?: string | null;
  quench_video_duration_seconds?: number | null;
}

export interface PyrolysisBatchDetail extends PyrolysisBatchRecord {
  generated_batch_code?: string | null;
  session_status: string;
  session_completed_at?: string | null;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
  protocol?: "csi" | "rainbow";
  kiln_photo_url?: string | null;
  sensor_logs?: PyrolysisSensorLog[];
  run_proof?: RainbowRunProof | null;
  volume_percent?: number | null;
  kontikki_capacity_liters?: number | null;
  biochar_bulk_density_kg_m3?: number | null;
  estimated_biochar_volume_liters?: number | null;
  estimated_biochar_mass_kg?: number | null;
  sample_spots?: Array<{
    spot: number;
    photo_url?: string | null;
    photo_metadata?: { captured_at?: string | null } | null;
  }>;
  sample_pile_photo_url?: string | null;
  sample_bag_code?: string | null;
  sample_bag_photo_url?: string | null;
  sample_bag_not_used?: boolean;
  sample_collected_at?: string | null;
  batch_status: {
    id: string;
    batch_id: string;
    status: PyrolysisBatchStatusValue;
    reviewer_notes?: string | null;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    reviewer?: { id: string; full_name?: string | null } | null;
    flags?: PyrolysisBatchStatusFlag[];
  } | null;
  mixing_entries?: PyrolysisBatchMixingEntrySummary[];
}

export interface PyrolysisBatchTableRow extends DbRow {
  id: string;
  batch_label: string;
  kontikki_code: string;
  producer: string;
  producer_id?: string | null;
  operator_name: string;
  session_status: string;
  review_status: string;
  yield_percent: string;
  search_index: string;
}

const PHOTO_URL_FIELD: Record<PyrolysisBatchStatusPhotoKey, keyof PyrolysisBatchRecord> = {
  feedstock_photo: "feedstock_photo_url",
  feedstock_size_photo: "feedstock_size_photo_url",
  moisture_photo_1: "moisture_photo_url_1",
  moisture_photo_2: "moisture_photo_url_2",
  moisture_photo_3: "moisture_photo_url_3",
  moisture_photo_4: "moisture_photo_url_4",
  moisture_photo_5: "moisture_photo_url_5",
  stage_initial: "stage_initial_photo_url",
  stage_middle: "stage_middle_photo_url",
  stage_final: "stage_final_photo_url",
  stage_quenching: "stage_quenching_photo_url",
};

export function batchPhotoUrl(
  batch: PyrolysisBatchRecord,
  photoKey: PyrolysisBatchStatusPhotoKey,
): string | null {
  const field = PHOTO_URL_FIELD[photoKey];
  const value = batch[field];
  return typeof value === "string" ? value : null;
}

export function formatBatchLabel(batch: {
  batch_number?: string | null;
  generated_batch_code?: string | null;
  kontikki_code: string;
}) {
  const productionBatch = batch.generated_batch_code?.trim();
  if (productionBatch?.includes(" - ")) return productionBatch;
  if (batch.batch_number?.trim()) return batch.batch_number;
  return batch.kontikki_code;
}

export function productionBatchSearchIndex(batch: PyrolysisBatchListItem): string {
  return buildSearchIndex(
    batch.id,
    batch.batch_number,
    batch.generated_batch_code,
    batch.kontikki_code,
    batch.kontikki_id,
    batch.producer_name,
    batch.producer_id,
    batch.operator_name,
    batch.session_status,
    batch.review_status,
    pyrolysisBatchStatusValueLabel(batch.review_status),
    batch.feedstock_name,
    batch.feedstock_id,
    batch.feedstock_quantity,
    batch.avg_feedstock_size_cm,
    batch.sample_id,
    batch.location_address,
    batch.location_lat,
    batch.location_lng,
    batch.comment,
    batch.reviewer_notes,
    batch.review_flag_text,
    batch.moisture_readings,
    batch.yield_percent,
    batch.pyrolysis_completed ? "completed" : "in progress",
    batch.reviewed_at,
    batch.created_at,
    batch.updated_at,
  );
}

export function formatReviewStatus(status: PyrolysisBatchStatusValue) {
  return pyrolysisBatchStatusValueLabel(status);
}

export function formatFlagStatus(
  status: Parameters<typeof pyrolysisBatchStatusFlagValueLabel>[0],
) {
  return pyrolysisBatchStatusFlagValueLabel(status);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function reviewStatusTone(
  status: PyrolysisBatchStatusValue,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "accepted":
      return "success";
    case "rejected":
      return "danger";
    case "on_hold":
      return "warning";
    default:
      return "neutral";
  }
}

export function flagStatusTone(
  status: Parameters<typeof pyrolysisBatchStatusFlagValueLabel>[0],
): "success" | "warning" | "danger" {
  switch (status) {
    case "accepted":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "warning";
  }
}

export function flagMap(
  flags: PyrolysisBatchStatusFlag[] | undefined,
): Map<string, PyrolysisBatchStatusFlag> {
  const map = new Map<string, PyrolysisBatchStatusFlag>();
  for (const flag of flags ?? []) {
    map.set(`${flag.target_type}:${flag.target_key}`, flag);
  }
  return map;
}
