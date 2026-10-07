"use server";

import { revalidatePath } from "next/cache";
import { backendFetch } from "@/lib/backendApi";

async function save(path: string, payload: unknown): Promise<string | null> {
  try {
    await backendFetch(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    revalidatePath("/verification-reports/rainbow");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Save failed.";
  }
}

export async function saveRainbowLabSample(payload: {
  pyrolysis_batch_id: string;
  organic_carbon_percent: number;
  hcorg: number;
  lab_name: string;
  analyzed_on: string;
  report_url: string;
}) {
  return save("/verification-reports/rainbow/lab-samples", payload);
}

export async function saveRainbowPollutants(payload: {
  feedstock_id: string;
  test_year: number;
  lead_mg_kg: number;
  cadmium_mg_kg: number;
  copper_mg_kg: number;
  nickel_mg_kg: number;
  mercury_mg_kg: number;
  zinc_mg_kg: number;
  chromium_mg_kg: number;
  arsenic_mg_kg: number;
  tested_on: string;
  lab_name: string;
  report_url: string;
}) {
  return save("/verification-reports/rainbow/pollutants", payload);
}

export async function saveRainbowMethane(payload: {
  feedstock_id: string;
  kontikki_id: string;
  period_year: number;
  measured_on: string;
  kg_ch4_per_kg_biochar: number;
  provider_name: string;
  report_url: string;
}) {
  return save("/verification-reports/rainbow/methane", payload);
}

export async function deleteRainbowMethane(id: string) {
  try {
    await backendFetch(`/verification-reports/rainbow/methane/${id}`, {
      method: "DELETE",
    });
    revalidatePath("/verification-reports/rainbow");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Delete failed.";
  }
}

export async function saveRainbowEmissions(payload: {
  feedstock_id: string;
  period_year: number;
  biomass_left_on_soil: boolean;
  sequestration_rate: number;
  biomass_carbon_fraction: number | null;
  transport_tco2e: number;
  kiln_steel_tco2e: number;
  processing_tco2e: number;
  notes: string;
}) {
  return save("/verification-reports/rainbow/emissions", payload);
}

export async function saveRainbowSoilTemperature(payload: {
  mixing_entry_id: string;
  soil_temp_c: number;
  source_note: string;
}) {
  return save("/verification-reports/rainbow/soil-temperature", payload);
}
