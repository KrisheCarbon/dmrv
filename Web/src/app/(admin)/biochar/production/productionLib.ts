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

export const PYROLYSIS_PHOTOS_BUCKET = "pyrolysis";

export interface PyrolysisBatchListItem extends DbRow {
  id: string;
  batch_number?: string | null;
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
  created_at?: string;
  updated_at?: string;
}

export interface PyrolysisBatchDetail extends PyrolysisBatchRecord {
  session_status: string;
  session_completed_at?: string | null;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
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
  kontikki_code: string;
}) {
  if (batch.batch_number?.trim()) return batch.batch_number;
  return batch.kontikki_code;
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
