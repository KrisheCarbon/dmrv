"use server";

import { backendQuery } from "@/lib/backendApi";
import type { FarmerMapStats } from "./stats-types";

export async function getFarmerMapStats() {
  return backendQuery<FarmerMapStats>("/map-stats/farmers");
}
