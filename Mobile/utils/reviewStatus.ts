import {
  applicationEntryReviewStatusLabel,
  mixingEntryReviewStatusLabel,
  pyrolysisBatchStatusValueLabel,
  type ApplicationEntryReviewStatus,
  type MixingEntryReviewStatus,
  type PyrolysisBatchStatusValue,
} from "@krishecarbon/shared";
import { colors } from "../constants/theme";

export type ReviewStatusTone = "neutral" | "success" | "warning" | "danger";

export function reviewStatusLabel(status: string | null | undefined): string {
  if (!status || status === "pending") {
    return pyrolysisBatchStatusValueLabel("pending");
  }
  if (status === "pending_review" || status === "approved") {
    return mixingEntryReviewStatusLabel(status as MixingEntryReviewStatus);
  }
  if (status === "accepted" || status === "rejected" || status === "on_hold") {
    return pyrolysisBatchStatusValueLabel(status as PyrolysisBatchStatusValue);
  }
  return applicationEntryReviewStatusLabel(status as ApplicationEntryReviewStatus);
}

export function reviewStatusTone(
  status: string | null | undefined,
): ReviewStatusTone {
  if (status === "accepted" || status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "on_hold") return "warning";
  return "neutral";
}

export const reviewStatusColors: Record<
  ReviewStatusTone,
  { text: string; background: string }
> = {
  neutral: { text: colors.smoke, background: colors.chalk },
  success: { text: colors.success, background: colors.successBg },
  warning: { text: colors.warning, background: colors.warningBg },
  danger: { text: colors.error, background: colors.errorBg },
};

export function summarizeReviewStatuses(
  statuses: Array<string | null | undefined>,
): string | null {
  const resolved = statuses.map((status) => status || "pending");
  if (resolved.length === 0) return null;
  if (resolved.every((status) => status === resolved[0])) {
    return resolved[0];
  }
  if (resolved.includes("rejected")) return "rejected";
  if (resolved.includes("on_hold")) return "on_hold";
  if (resolved.includes("pending") || resolved.includes("pending_review")) {
    return "pending";
  }
  return resolved[0];
}
