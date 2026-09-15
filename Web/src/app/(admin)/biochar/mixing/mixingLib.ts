import type {
  MixingEntryRecord,
  MixingEntryReviewStatus,
  MixingPyrolysisLinkRecord,
} from "@krishecarbon/shared";
import { mixingEntryReviewStatusLabel, mixingMaterialLabel, mixingEntryPhotoLabel } from "@krishecarbon/shared";
import type { DbRow } from "@/types/entities";
import { buildSearchIndex, photoMetadataSearchParts } from "@/lib/searchIndex";

export interface MixingEntryListItem extends MixingEntryRecord {
  operator_name: string;
  review_status: MixingEntryReviewStatus;
  reviewed_at?: string | null;
}

export type MixingEntryDetail = MixingEntryListItem;

export interface MixingEntryTableRow extends DbRow {
  id: string;
  time: string;
  farm_name: string;
  farm_id?: string | null;
  material: string;
  ratio: string;
  operator_name: string;
  pyrolysis_links: MixingPyrolysisLinkRecord[];
  status: string;
  status_raw: MixingEntryReviewStatus;
  search_index: string;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatReviewStatus(status: MixingEntryReviewStatus) {
  return mixingEntryReviewStatusLabel(status);
}

export function reviewStatusTone(
  status: MixingEntryReviewStatus,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "on_hold":
      return "warning";
    default:
      return "neutral";
  }
}

export function formatLinkedBatchLabel(link: {
  batch_number?: string | null;
  kontikki_code?: string | null;
}) {
  if (link.batch_number?.trim()) return link.batch_number;
  if (link.kontikki_code?.trim()) return link.kontikki_code;
  return "Batch";
}

export function formatMaterial(entry: Pick<MixingEntryRecord, "material_type">) {
  return entry.material_type ? mixingMaterialLabel(entry.material_type) : "—";
}

export function formatRatio(
  ratio: MixingEntryRecord["material_to_biochar_ratio"],
) {
  return ratio != null && !Number.isNaN(ratio) ? String(ratio) : "—";
}

export function formatLocation(
  entry: Pick<MixingEntryRecord, "location_address" | "location_lat" | "location_lng">,
) {
  if (entry.location_address?.trim()) return entry.location_address;
  if (entry.location_lat != null && entry.location_lng != null) {
    return `${entry.location_lat}, ${entry.location_lng}`;
  }
  return "—";
}

export function mixingEntrySearchIndex(entry: MixingEntryListItem): string {
  const reviewStatus = resolveReviewStatus(entry);
  return buildSearchIndex(
    entry.id,
    entry.farm_name,
    entry.farm_id,
    formatLocation(entry),
    entry.location_address,
    entry.location_lat,
    entry.location_lng,
    entry.material_type,
    formatMaterial(entry),
    entry.material_to_biochar_ratio,
    entry.comment,
    entry.operator_name,
    reviewStatus,
    formatReviewStatus(reviewStatus),
    entry.entry_status?.reviewer_notes,
    entry.entry_status?.reviewer?.full_name,
    entry.started_at,
    formatDateTime(entry.started_at),
    entry.pyrolysis_links,
    entry.pyrolysis_links.map((link) => formatLinkedBatchLabel(link)),
    entry.pyrolysis_links.map((link) => link.producer_name),
    photoMetadataSearchParts(entry.biochar_photo_metadata),
    photoMetadataSearchParts(entry.substrate_photo_metadata),
    photoMetadataSearchParts(entry.mixing_photo_metadata),
    entry.entry_status?.photo_flags?.map(
      (flag) => `${flag.photo_key} ${flag.flagged ? "flagged" : "ok"}`,
    ),
    entry.entry_status?.photo_flags
      ?.filter((flag) => flag.flagged)
      .map((flag) => mixingEntryPhotoLabel(flag.photo_key)),
  );
}

export function resolveReviewStatus(entry: MixingEntryDetail): MixingEntryReviewStatus {
  return entry.entry_status?.status ?? entry.review_status ?? "pending_review";
}

export function photoFlagMap(
  entry: MixingEntryDetail,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const flag of entry.entry_status?.photo_flags ?? []) {
    if (flag.flagged) map.set(flag.photo_key, true);
  }
  return map;
}
