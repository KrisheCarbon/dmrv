"use server";

import { backendFetch } from "@/lib/backendApi";
import type { Climapreneur, ClimapreneurBankAccount } from "@/types";

export interface BankAccountSavePayload {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  bank_address: string;
  upi_id?: string | null;
}

export async function listClimapreneurs() {
  return backendFetch<Climapreneur[]>("/climapreneurs");
}

export async function getClimapreneur(id: string) {
  return backendFetch<Climapreneur>(`/climapreneurs/${id}`);
}

export async function upsertClimapreneurBankAccount(
  climapreneurId: string,
  payload: BankAccountSavePayload,
) {
  return backendFetch<ClimapreneurBankAccount>(
    `/climapreneurs/${climapreneurId}/bank-account`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}
