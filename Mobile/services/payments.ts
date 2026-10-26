import { backendFetch } from "./backendApi";

export interface PaymentActivityTotal {
  activity: string;
  label: string;
  count: number;
  payments?: number;
  amount_inr: number;
  how?: string;
}

export interface PaymentEarning {
  id: string;
  label: string;
  occurred_on: string;
  amount_inr: number;
  place: string;
  rate_card_name: string;
}

export interface PaymentPending {
  source_id: string;
  label: string;
  reason: string;
}

export interface PaymentPerson {
  id: string;
  name: string;
  role: string;
  owed: number;
  paid: number;
  balance: number;
  by_activity: PaymentActivityTotal[];
  pending: PaymentPending[];
  recent: PaymentEarning[];
}

export interface PaymentDisbursement {
  id: string;
  payee_id: string;
  payee_name: string;
  amount_inr: number;
  paid_on: string;
  note: string | null;
  proof_name: string | null;
  signed_url: string | null;
}

export interface PaymentStatement {
  viewer: {
    id: string;
    role: string;
    can_manage: boolean;
    scope: "all" | "self";
  };
  totals: {
    owed: number;
    paid: number;
    balance: number;
    entry_count: number;
  };
  rates_active?: boolean;
  by_activity: PaymentActivityTotal[];
  people: PaymentPerson[];
  disbursements: PaymentDisbursement[];
  pending_count: number;
}

export function fetchPaymentStatement(): Promise<PaymentStatement> {
  return backendFetch<PaymentStatement>("/payments/statement");
}
