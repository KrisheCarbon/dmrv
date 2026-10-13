"use server";

import { backendFetch } from "@/lib/backendApi";
import type { BiomassCollectionRecord } from "@krishecarbon/shared";

export async function listBiomassCollections() {
  return backendFetch<BiomassCollectionRecord[]>("/biomass-collections");
}

export async function getBiomassCollection(id: string) {
  return backendFetch<BiomassCollectionRecord>(`/biomass-collections/${id}`);
}
