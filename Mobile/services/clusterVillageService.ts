import type { ClusterVillageRecord } from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { backendFetch } from "./backendApi";

export async function getLocalClusterVillages(): Promise<ClusterVillageRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    cluster_id: string;
    cluster_name: string;
    village_name: string;
    mandal: string | null;
    district: string | null;
    state: string | null;
  }>("SELECT * FROM cluster_villages ORDER BY cluster_name, village_name");

  return rows.map((row) => ({
    id: row.id,
    cluster_id: row.cluster_id,
    cluster_name: row.cluster_name,
    village_name: row.village_name,
    mandal: row.mandal,
    district: row.district,
    state: row.state,
  }));
}

export async function pullClusterVillages(): Promise<ClusterVillageRecord[]> {
  const remote = await backendFetch<ClusterVillageRecord[]>(
    "/clusters/village-options",
  );
  const db = await getDb();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM cluster_villages");
    for (const village of remote) {
      await db.runAsync(
        `INSERT INTO cluster_villages (
          id, cluster_id, cluster_name, village_name, mandal, district, state, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          village.id,
          village.cluster_id,
          village.cluster_name,
          village.village_name,
          village.mandal ?? null,
          village.district ?? null,
          village.state ?? null,
          now,
        ],
      );
    }
  });

  return remote;
}

export async function loadClusterVillages(): Promise<ClusterVillageRecord[]> {
  try {
    return await pullClusterVillages();
  } catch {
    return getLocalClusterVillages();
  }
}
