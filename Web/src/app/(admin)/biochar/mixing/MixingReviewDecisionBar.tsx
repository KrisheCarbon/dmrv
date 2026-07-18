"use client";

import type { MixingEntryReviewDecision } from "@krishecarbon/shared";
import { MIXING_ENTRY_REVIEW_DECISION_VALUES } from "@krishecarbon/shared";
import ReviewDecisionBar, {
  REVIEW_DECISION_ICONS,
  REVIEW_DECISION_STYLES,
} from "../ReviewDecisionBar";

const MIXING_DECISION_OPTIONS = MIXING_ENTRY_REVIEW_DECISION_VALUES.map((value) => ({
  value,
  shortLabel: value === "approved" ? "Approve" : value === "rejected" ? "Reject" : "On hold",
  selectedClass:
    value === "approved"
      ? REVIEW_DECISION_STYLES.approve
      : value === "rejected"
        ? REVIEW_DECISION_STYLES.reject
        : REVIEW_DECISION_STYLES.onHold,
  icon:
    value === "approved"
      ? REVIEW_DECISION_ICONS.approve
      : value === "rejected"
        ? REVIEW_DECISION_ICONS.reject
        : REVIEW_DECISION_ICONS.onHold,
}));

export default function MixingReviewDecisionBar({
  decision,
  reviewerNotes,
  submitting,
  onDecisionChange,
  onNotesChange,
  onSubmit,
}: {
  decision: MixingEntryReviewDecision;
  reviewerNotes: string;
  submitting: boolean;
  onDecisionChange: (decision: MixingEntryReviewDecision) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
}) {
  return (
    <ReviewDecisionBar
      decision={decision}
      options={MIXING_DECISION_OPTIONS}
      reviewerNotes={reviewerNotes}
      submitting={submitting}
      onDecisionChange={onDecisionChange}
      onNotesChange={onNotesChange}
      onSubmit={onSubmit}
    />
  );
}
