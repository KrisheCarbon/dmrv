import type {
  FeedstockDetail,
  FeedstockLabStatus,
  FeedstockProducerRef,
  MethaneCompensationStrategy,
} from "@/types";

export type FeedstockSavePayload = {
  biomass_type: string;
  biochar_producer_id: string;
  biochar_bulk_density_kg_m3: number;
  carbon_content_percent: number;
  hc_ratio: number;
  lab_status: FeedstockLabStatus;
  lab_submission_date: string;
  lab_analysis_date: string;
  biomass_preparation_instruction?: string | null;
  methane_compensation_strategy: MethaneCompensationStrategy;
  lab_report_doc_url?: string | null;
  lab_report_image_url?: string | null;
  ghg_avoidance_approval_doc_url?: string | null;
  ghg_avoidance_approval_image_url?: string | null;
};

export type FeedstockUpdatePayload = Partial<FeedstockSavePayload>;

export const LAB_STATUS_OPTIONS: {
  value: FeedstockLabStatus;
  label: string;
}[] = [
  { value: "estimated", label: "Estimated" },
  { value: "waiting_for_results", label: "Waiting for results" },
  { value: "analysis_completed", label: "Analysis completed" },
  { value: "superseded", label: "Superseded" },
];

export const METHANE_STRATEGY_OPTIONS: {
  value: MethaneCompensationStrategy;
  label: string;
}[] = [
  {
    value: "offsetting_from_scp_fraction",
    label: "Offsetting from SCP fraction",
  },
  {
    value: "csi_approved_avoidance_of_ghg",
    label: "CSI approved avoidance of GHG",
  },
];

export function formatLabStatus(status?: FeedstockLabStatus | string | null) {
  const match = LAB_STATUS_OPTIONS.find((option) => option.value === status);
  return match?.label ?? status ?? "—";
}

export function formatMethaneStrategy(
  strategy?: MethaneCompensationStrategy | string | null,
) {
  const match = METHANE_STRATEGY_OPTIONS.find(
    (option) => option.value === strategy,
  );
  return match?.label ?? strategy ?? "—";
}

export function resolveFeedstockProducer(
  feedstock: Pick<FeedstockDetail, "biochar_producer" | "biochar_producer_id">,
): FeedstockProducerRef | null {
  const producer = Array.isArray(feedstock.biochar_producer)
    ? feedstock.biochar_producer[0]
    : feedstock.biochar_producer;

  if (producer?.id) {
    return producer;
  }

  if (feedstock.biochar_producer_id) {
    return { id: feedstock.biochar_producer_id };
  }

  return null;
}

export function producerLabel(producer: FeedstockProducerRef | null) {
  if (!producer) return "—";
  if (producer.name && producer.producer_code) {
    return `${producer.name} (${producer.producer_code})`;
  }
  return producer.name ?? producer.producer_code ?? producer.id;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}
