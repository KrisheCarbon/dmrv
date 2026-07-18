import type {
  ApplicationEntryRecord,
  ApplicationEntryReviewStatus,
  ApplicationPyrolysisLinkRecord,
} from "@krishecarbon/shared";
import {
  applicationEntryReviewStatusLabel,
  applicationMediaTypeLabel,
} from "@krishecarbon/shared";
import type { DbRow } from "@/types/entities";

export interface ApplicationEntryListItem extends ApplicationEntryRecord {
  operator_name: string;
  review_status: ApplicationEntryReviewStatus;
  reviewed_at?: string | null;
}

export type ApplicationEntryDetail = ApplicationEntryListItem;

export interface ApplicationEntryTableRow extends DbRow {
  id: string;
  time: string;
  farm_name: string;
  farm_id?: string | null;
  media: string;
  operator_name: string;
  pyrolysis_links: ApplicationPyrolysisLinkRecord[];
  status: string;
  status_raw: ApplicationEntryReviewStatus;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatReviewStatus(status: ApplicationEntryReviewStatus) {
  return applicationEntryReviewStatusLabel(status);
}

export function reviewStatusTone(
  status: ApplicationEntryReviewStatus,
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

export function formatMediaType(entry: Pick<ApplicationEntryRecord, "media_type">) {
  return applicationMediaTypeLabel(entry.media_type);
}

export function resolveReviewStatus(
  entry: ApplicationEntryDetail,
): ApplicationEntryReviewStatus {
  return entry.entry_status?.status ?? entry.review_status ?? "pending_review";
}

export function mediaFlagMap(entry: ApplicationEntryDetail): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const flag of entry.entry_status?.media_flags ?? []) {
    if (flag.flagged) map.set(flag.media_key, true);
  }
  return map;
}
