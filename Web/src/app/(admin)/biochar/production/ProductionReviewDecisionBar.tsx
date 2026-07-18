"use client";

import { PYROLYSIS_BATCH_STATUS_FLAG_VALUES } from "@krishecarbon/shared";
import type { SubmitPyrolysisBatchStatusPayload } from "@krishecarbon/shared";
import ReviewDecisionBar, {
  REVIEW_DECISION_ICONS,
  REVIEW_DECISION_STYLES,
} from "../ReviewDecisionBar";

type ProductionDecision = SubmitPyrolysisBatchStatusPayload["status"];

const PRODUCTION_DECISION_OPTIONS = PYROLYSIS_BATCH_STATUS_FLAG_VALUES.map((value) => ({
  value,
  shortLabel: value === "accepted" ? "Approve" : value === "rejected" ? "Reject" : "On hold",
  selectedClass:
    value === "accepted"
      ? REVIEW_DECISION_STYLES.approve
      : value === "rejected"
        ? REVIEW_DECISION_STYLES.reject
        : REVIEW_DECISION_STYLES.onHold,
  icon:
    value === "accepted"
      ? REVIEW_DECISION_ICONS.approve
      : value === "rejected"
        ? REVIEW_DECISION_ICONS.reject
        : REVIEW_DECISION_ICONS.onHold,
}));

export default function ProductionReviewDecisionBar({
  decision,
  reviewerNotes,
  submitting,
  onDecisionChange,
  onNotesChange,
  onSubmit,
}: {
  decision: ProductionDecision;
  reviewerNotes: string;
  submitting: boolean;
  onDecisionChange: (decision: ProductionDecision) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
}) {
  return (
    <ReviewDecisionBar
      decision={decision}
      options={PRODUCTION_DECISION_OPTIONS}
      reviewerNotes={reviewerNotes}
      submitting={submitting}
      onDecisionChange={onDecisionChange}
      onNotesChange={onNotesChange}
      onSubmit={onSubmit}
    />
  );
}
