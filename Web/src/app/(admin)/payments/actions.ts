"use server";

import { backendFetch } from "@/lib/backendApi";
import type {
  PaymentOptions,
  PaymentStatement,
  RateCard,
  RateCardPayload,
} from "./paymentsLib";

export async function getPaymentOptions() {
  return backendFetch<PaymentOptions>("/payments/options");
}

export async function getPaymentStatement(query: {
  from?: string;
  to?: string;
  payeeId?: string;
}) {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.payeeId) params.set("payee_id", query.payeeId);
  const search = params.toString();
  return backendFetch<PaymentStatement>(
    `/payments/statement${search ? `?${search}` : ""}`,
  );
}

export async function listRateCards() {
  return backendFetch<RateCard[]>("/payments/rate-cards");
}

export async function saveRateCard(payload: RateCardPayload, id?: string) {
  return backendFetch<RateCard>(id ? `/payments/rate-cards/${id}` : "/payments/rate-cards", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
}

export async function archiveRateCard(id: string) {
  return backendFetch<RateCard>(`/payments/rate-cards/${id}/archive`, { method: "POST" });
}

export async function restoreRateCard(id: string) {
  return backendFetch<RateCard>(`/payments/rate-cards/${id}/restore`, { method: "POST" });
}

export async function recordPayment(payload: {
  payee_id: string;
  amount_inr: number;
  paid_on: string;
  note?: string | null;
  proof_path: string;
  proof_name: string;
}) {
  return backendFetch("/payments/disbursements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
