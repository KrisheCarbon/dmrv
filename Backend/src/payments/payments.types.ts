export const PAYMENT_ACTIVITIES = [
  'farmer_registration',
  'farm_registration',
  'soil_sample',
  'pyrolysis_batch',
  'mixing_batch',
  'biomass_collection',
  'application',
] as const;

export type PaymentActivity = (typeof PAYMENT_ACTIVITIES)[number];

export const PAYMENT_SCOPES = ['all_producers', 'producers', 'villages'] as const;

export type PaymentScope = (typeof PAYMENT_SCOPES)[number];

export const FARM_BASES = ['any_farm', 'per_farm', 'full_area'] as const;

export type FarmBasis = (typeof FARM_BASES)[number];

export const ACTIVITY_LABELS: Record<PaymentActivity, string> = {
  farmer_registration: 'Farmer registration',
  farm_registration: 'Farm registration',
  soil_sample: 'Soil sample',
  pyrolysis_batch: 'Pyrolysis batch',
  mixing_batch: 'Mixing batch',
  biomass_collection: 'Biomass collection',
  application: 'Application',
};

export const FARM_BASIS_LABELS: Record<FarmBasis, string> = {
  any_farm: 'Pay once when any farm plot is entered',
  per_farm: 'Pay for every farm plot entered',
  full_area: "Pay once when entered area covers the farmer's registered land",
};

export interface RateInput {
  activity: PaymentActivity;
  amount_inr: number;
  farm_basis?: FarmBasis | null;
}

export interface RateCardWrite {
  name: string;
  scope: PaymentScope;
  producer_ids: string[];
  village_ids: string[];
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  rates: RateInput[];
}

export interface RateCardRecord {
  id: string;
  name: string;
  scope: PaymentScope;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  producer_ids: string[];
  village_ids: string[];
  rates: RateInput[];
  created_at: string;
}

export interface WorkLocation {
  producer_ids: string[];
  village_id: string | null;
}

export interface EarningLine {
  id: string;
  payee_id: string;
  activity: PaymentActivity;
  source_id: string;
  label: string;
  occurred_on: string;
  amount_inr: number;
  place: string;
  rate_card_id: string;
  rate_card_name: string;
  farm_basis: FarmBasis | null;
}

export interface PendingLine {
  payee_id: string;
  source_id: string;
  label: string;
  reason: string;
}

export interface FarmPlotWork {
  id: string;
  created_on: string;
  area: number;
  label: string;
}

export interface FarmerWork {
  id: string;
  payee_id: string;
  label: string;
  registered_on: string;
  location: WorkLocation;
  place: string;
  registered_area: number;
  fields: FarmPlotWork[];
}

export interface CountedWork {
  id: string;
  payee_id: string;
  activity: PaymentActivity;
  label: string;
  occurred_on: string;
  location: WorkLocation;
  place: string;
}

export interface ActivityTotal {
  activity: PaymentActivity;
  label: string;
  /** Records on file, including ones a rate card has not priced. */
  count: number;
  /** Records that added rupees. */
  payments: number;
  amount_inr: number;
  /** Plain explanation of how the amount was reached. */
  how: string;
}

/** One entered record, whether or not a rate card has priced it yet. */
export interface WorkCount {
  payee_id: string;
  activity: PaymentActivity;
  occurred_on: string;
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
  proof_bucket: string | null;
  proof_path: string | null;
  signed_url: string | null;
}

export interface PaymentStatement {
  currency: 'INR';
  viewer: {
    id: string;
    role: string;
    can_manage: boolean;
    scope: 'all' | 'self';
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
  /** False when no rate card is in force, so owed amounts stay at zero. */
  rates_active: boolean;
  by_activity: ActivityTotal[];
  people: StatementPerson[];
  disbursements: StatementDisbursement[];
  pending_count: number;
}
