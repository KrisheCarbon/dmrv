import { getDb } from "../database/db";
import { getAllFarmersLocal } from "../services/farmerService";
import { getUserProfile } from "../services/userProfile";

export type NetworkModule = "farmer" | "farm" | "soil_sample" | "consent" | "soil_report";

/**
 * Saved entries for a Farmers Network module, scoped like its list screen.
 * Zero means the user has never entered one, so the card opens the form.
 */
export async function countNetworkEntries(module: NetworkModule): Promise<number> {
  const db = await getDb();
  if (module === "soil_sample") {
    const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM soil_tests");
    return row?.n ?? 0;
  }
  if (module === "soil_report") {
    const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM soil_reports");
    return row?.n ?? 0;
  }
  const profile = await getUserProfile();
  if (!profile) return 0;
  const farmers = await getAllFarmersLocal(profile.id, profile.role);
  if (module === "farmer" || farmers.length === 0) return farmers.length;
  const ids = farmers.map((farmer) => farmer.id);
  const table = module === "farm" ? "farm_fields" : "farmer_consents";
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE farmer_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return row?.n ?? 0;
}
