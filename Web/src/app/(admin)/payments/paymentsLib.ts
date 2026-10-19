export const PAYMENT_PROOF_BUCKET = "payment-proofs";

export type PaymentActivity =
  | "farmer_registration"
  | "farm_registration"
  | "soil_sample"
  | "pyrolysis_batch"
  | "mixing_batch"
  | "biomass_collection"
  | "application";

export type PaymentScope = "all_producers" | "producers" | "villages";
export type FarmBasis = "any_farm" | "per_farm" | "full_area";

export interface RateInput {
  activity: PaymentActivity;
  amount_inr: number;
  farm_basis?: FarmBasis | null;
}

export interface RateCardPayload {
  name: string;
  scope: PaymentScope;
  producer_ids: string[];
  village_ids: string[];
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  rates: RateInput[];
}

export interface RateCard extends RateCardPayload {
  id: string;
  status: "active" | "archived";
  created_at: string;
}

export interface PaymentOptions {
  activities: { activity: PaymentActivity; label: string }[];
  farm_bases: { basis: FarmBasis; label: string }[];
  producers: { id: string; name: string; villages: { id: string; name: string }[] }[];
  villages: { id: string; name: string; cluster_name: string }[];
  payees: { id: string; name: string; role: string }[];
}

export interface ActivityTotal {
  activity: PaymentActivity;
  label: string;
  count: number;
  payments: number;
  amount_inr: number;
  how: string;
}

export interface EarningLine {
  id: string;
  activity: PaymentActivity;
  label: string;
  occurred_on: string;
  amount_inr: number;
  place: string;
  rate_card_name: string;
}

export interface PendingLine {
  source_id: string;
  label: string;
  reason: string;
}

export interface StatementPerson {
  id: string;
  name: string;
  role: string;
  owed: number;
  paid: number;
  balance: number;
  by_activity: ActivityTotal[];
  pending: PendingLine[];
  recent: EarningLine[];
}

export interface StatementDisbursement {
  id: string;
  payee_id: string;
  payee_name: string;
  payee_role: string;
  amount_inr: number;
  paid_on: string;
  note: string | null;
  proof_name: string | null;
  proof_path: string | null;
  signed_url: string | null;
}

export interface PaymentStatement {
  currency: "INR";
  viewer: {
    id: string;
    role: string;
    can_manage: boolean;
    scope: "all" | "self";
  };
  from: string | null;
  to: string | null;
  totals: {
    owed: number;
    paid: number;
    balance: number;
    entry_count: number;
    unattributed: number;
  };
  rates_active: boolean;
  by_activity: ActivityTotal[];
  people: StatementPerson[];
  disbursements: StatementDisbursement[];
  pending_count: number;
}

export const FARM_BASIS_LABELS: Record<FarmBasis, string> = {
  any_farm: "Pay once when any farm plot is entered",
  per_farm: "Pay for every farm plot entered",
  full_area: "Pay once when entered area covers the farmer's registered land",
};

export const SCOPE_LABELS: Record<PaymentScope, string> = {
  all_producers: "All producer sites",
  producers: "Selected producer sites",
  villages: "Selected villages",
};

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
