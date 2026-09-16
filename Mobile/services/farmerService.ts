import {
  calculateEstimatedBiomass,
  canAccessWebPortal,
  normalizeMobileNumber,
  type FarmerForm,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import { farmerToRow, rowToFarmer, syncQueueItemToRow, type Farmer } from "../database/types";
import { generateFarmerCode } from "./farmersNetworkService";

export type ExtendedFarmerForm = FarmerForm & {
  father_spouse_name?: string;
  agri_id?: string;
  village?: string;
  mandal?: string;
  district?: string;
  state?: string;
  cluster_id?: string | null;
  cluster_village_id?: string | null;
  cluster_name?: string | null;
  owned_land_size?: string | number;
  leased_land_size?: string | number;
  farmer_photo_uri?: string | null;
  farmer_photo_url?: string | null;
};

export function canSeeAllFarms(role?: string | null) {
  return Boolean(role && canAccessWebPortal(role));
}

export function farmerToFormData(
  farmer: Farmer,
): ExtendedFarmerForm & { id: string; farmer_code?: string | null; sync_status: string; sync_error?: string | null } {
  return {
    id: farmer.id,
    server_id: farmer.serverId,
    farmer_code: farmer.farmerCode,
    farmer_name: farmer.farmerName,
    father_spouse_name: farmer.fatherSpouseName ?? "",
    agri_id: farmer.agriId ?? "",
    mobile_number: farmer.mobileNumber,
    latitude: farmer.latitude,
    longitude: farmer.longitude,
    address: farmer.address,
    village: farmer.village ?? "",
    mandal: farmer.mandal ?? "",
    district: farmer.district ?? "",
    state: farmer.state ?? "",
    cluster_id: farmer.clusterId ?? "",
    cluster_village_id: farmer.clusterVillageId ?? "",
    cluster_name: farmer.clusterName ?? "",
    total_land_size: String(farmer.totalLandSize),
    owned_land_size: farmer.ownedLandSize != null ? String(farmer.ownedLandSize) : "",
    leased_land_size: farmer.leasedLandSize != null ? String(farmer.leasedLandSize) : "",
    farmer_photo_uri: farmer.farmerPhotoUri,
    farmer_photo_url: farmer.farmerPhotoUrl,
    crops: farmer.crops,
    interested_in_biochar: farmer.interestedInBiochar,
    prior_biochar_exp: farmer.priorBiocharExp,
    prior_biochar_acreage: farmer.priorBiocharAcreage
      ? String(farmer.priorBiocharAcreage)
      : "",
    estimated_biomass: farmer.estimatedBiomass,
    sync_status: farmer.uploadStatus,
    sync_error: farmer.syncError,
  };
}

export async function getAllFarmersLocal(
  userId: string,
  role?: string | null,
): Promise<Farmer[]> {
  const db = await getDb();

  const rows = canSeeAllFarms(role)
    ? await db.getAllAsync<any>(
        "SELECT * FROM farmers ORDER BY created_at DESC",
      )
    : await db.getAllAsync<any>(
        "SELECT * FROM farmers WHERE created_by = ? OR assigned_to = ? ORDER BY created_at DESC",
        [userId, userId],
      );

  return rows.map(rowToFarmer);
}

export async function getFarmerByIdLocal(id: string): Promise<Farmer> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM farmers WHERE id = ?", [id]);
  if (!row) {
    throw new Error(`Farmer with id ${id} not found`);
  }
  return rowToFarmer(row);
}

function numOrNull(value: string | number | null | undefined): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function saveFarmerLocal(
  form: ExtendedFarmerForm,
  userId: string,
  existingId: string | null = null,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const estimatedBiomass = calculateEstimatedBiomass(form.crops);
  const crops = form.crops ?? [];

  let farmerId = existingId;
  let syncOperation: "create" | "update" | null = null;

  const owned = numOrNull(form.owned_land_size);
  const leased = numOrNull(form.leased_land_size);
  const totalLand =
    Number(form.total_land_size) ||
    (owned ?? 0) + (leased ?? 0);

  if (existingId) {
    const existingRow = await db.getFirstAsync<any>(
      "SELECT server_id, farmer_code FROM farmers WHERE id = ?",
      [existingId],
    );
    if (!existingRow) {
      throw new Error(`Farmer with id ${existingId} not found`);
    }
    syncOperation = existingRow.server_id ? "update" : "create";

    const patch = {
      farmer_name: form.farmer_name.trim(),
      father_spouse_name: form.father_spouse_name?.trim() || null,
      agri_id: form.agri_id?.trim() || null,
      mobile_number: normalizeMobileNumber(form.mobile_number),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      address: form.address!.trim(),
      village: form.village?.trim() || null,
      mandal: form.mandal?.trim() || null,
      district: form.district?.trim() || null,
      state: form.state?.trim() || null,
      cluster_id: form.cluster_id?.trim() || null,
      cluster_village_id: form.cluster_village_id?.trim() || null,
      cluster_name: form.cluster_name?.trim() || null,
      total_land_size: totalLand,
      owned_land_size: owned,
      leased_land_size: leased,
      farmer_photo_uri: form.farmer_photo_uri?.trim() || null,
      farmer_photo_url: form.farmer_photo_url?.trim() || null,
      crops: JSON.stringify(crops),
      interested_in_biochar: form.interested_in_biochar ? 1 : 0,
      prior_biochar_exp: form.prior_biochar_exp ? 1 : 0,
      prior_biochar_acreage: form.prior_biochar_exp
        ? Number(form.prior_biochar_acreage)
        : null,
      estimated_biomass: estimatedBiomass,
      sync_status: "pending",
      sync_error: null,
      updated_at: now,
    };

    const { sql, args } = buildUpdate("farmers", patch, "id = ?", [existingId]);
    await db.runAsync(sql, args);
  } else {
    farmerId = generateId();
    syncOperation = "create";

    const row = farmerToRow({
      serverId: null,
      farmerCode: generateFarmerCode(),
      farmerName: form.farmer_name.trim(),
      fatherSpouseName: form.father_spouse_name?.trim() || null,
      agriId: form.agri_id?.trim() || null,
      mobileNumber: normalizeMobileNumber(form.mobile_number),
      latitude: Number(form.latitude) || 0,
      longitude: Number(form.longitude) || 0,
      address: (form.address || "").trim(),
      village: form.village?.trim() || null,
      mandal: form.mandal?.trim() || null,
      district: form.district?.trim() || null,
      state: form.state?.trim() || null,
      clusterId: form.cluster_id?.trim() || null,
      clusterVillageId: form.cluster_village_id?.trim() || null,
      clusterName: form.cluster_name?.trim() || null,
      totalLandSize: totalLand,
      ownedLandSize: owned,
      leasedLandSize: leased,
      farmerPhotoUri: form.farmer_photo_uri?.trim() || null,
      farmerPhotoUrl: form.farmer_photo_url?.trim() || null,
      crops,
      interestedInBiochar: !!form.interested_in_biochar,
      priorBiocharExp: !!form.prior_biochar_exp,
      priorBiocharAcreage: form.prior_biochar_exp
        ? Number(form.prior_biochar_acreage)
        : null,
      estimatedBiomass: estimatedBiomass,
      createdBy: userId,
      assignedTo: userId,
      uploadStatus: "pending",
      syncError: null,
      createdAt: now,
      updatedAt: now,
    });

    const { sql, args } = buildInsert("farmers", { id: farmerId, ...row });
    await db.runAsync(sql, args);
  }

  if (syncOperation && farmerId) {
    await enqueueSync(farmerId, syncOperation);
  }

  return farmerId!;
}

async function enqueueSync(entityLocalId: string, operation: "create" | "update") {
  const db = await getDb();

  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM sync_queue WHERE entity_local_id = ? AND status = ?",
    [entityLocalId, "pending"],
  );

  if (existing) {
    await db.runAsync("UPDATE sync_queue SET operation = ? WHERE id = ?", [
      operation,
      existing.id,
    ]);
    return;
  }

  const row = syncQueueItemToRow({
    entityType: "farmer",
    entityLocalId,
    operation,
    status: "pending",
    retries: 0,
    errorMessage: null,
    createdAt: Date.now(),
  });

  const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...row });
  await db.runAsync(sql, args);
}

export async function getPendingSyncCount(
  userId: string,
  role?: string | null,
): Promise<number> {
  const db = await getDb();

  const row = canSeeAllFarms(role)
    ? await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE sync_status = ?",
        ["pending"],
      )
    : await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE (created_by = ? OR assigned_to = ?) AND sync_status = ?",
        [userId, userId, "pending"],
      );

  return row?.count ?? 0;
}
