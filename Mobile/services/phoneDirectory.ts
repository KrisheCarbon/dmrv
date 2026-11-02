import NetInfo from "@react-native-community/netinfo";
import type { Farmer as ServerFarmer, FarmFieldRecord, FarmerCrop } from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate } from "../database/sqlHelpers";
import { farmerToRow, rowToFarmer, type Farmer } from "../database/types";
import { backendFetch, fetchMobileNetworkOverview } from "./backendApi";
import { pullClusterVillages } from "./clusterVillageService";
import { pullFarmFieldsForFarmer } from "./farmerNetworkSync";

const DIRECTORY_SYNC_MS = 5 * 60 * 1000;
const META_ID = "phone";

export type PhoneDirectoryPayload = {
  farmers: Array<{
    id: string;
    farmer_name: string;
    village: string | null;
    district: string | null;
    mobile_number: string | null;
    created_by: string | null;
  }>;
  farms: Array<{
    id: string;
    farmer_id: string;
    area: number | null;
  }>;
  kontikkis: Array<{
    id: string;
    registry_name: string | null;
    volume: number | null;
  }>;
};

/** A farmer row the lists can render without downloading the full profile. */
export type PhoneFarmerSummary = {
  id: string;
  serverId: string | null;
  farmer_name: string;
  village: string | null;
  district: string | null;
  mobile_number: string;
  created_by: string | null;
  sync_status: string;
  uploadStatus: string;
  sync_error: string | null;
  hasFarms: boolean;
  farmer_code: string | null;
  farmer_photo_uri: string | null;
  farmer_photo_url: string | null;
};

const listeners = new Set<() => void>();
let syncing: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function subscribePhoneDirectory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function startPhoneDirectorySync() {
  if (timer) return;
  void syncPhoneDirectoryIfStale();
  timer = setInterval(() => {
    void syncPhoneDirectoryIfStale();
  }, DIRECTORY_SYNC_MS);
}

export function stopPhoneDirectorySync() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function readDirectorySyncedAt(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ synced_at: number }>(
    "SELECT synced_at FROM directory_meta WHERE id = ?",
    [META_ID],
  );
  return row?.synced_at ?? null;
}

export async function syncPhoneDirectoryIfStale() {
  const syncedAt = await readDirectorySyncedAt();
  if (syncedAt && Date.now() - syncedAt < DIRECTORY_SYNC_MS) return;
  await syncPhoneDirectory();
}

/** Download the short farmer, farm, and kontikki lists and replace the copy on this phone. */
export function syncPhoneDirectory() {
  if (!syncing) {
    syncing = runDirectorySync().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

function directoryRouteMissing(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cannot get \/mobile-network\/directory/i.test(message);
}

/**
 * The short directory route is not on the live API yet. The same basics are
 * already on the farmer, farm, and network routes, so sync can use those
 * instead of failing with "Cannot GET /mobile-network/directory".
 */
async function fetchDirectoryFromExistingRoutes(): Promise<PhoneDirectoryPayload> {
  const [farmers, fields, overview] = await Promise.all([
    backendFetch<ServerFarmer[]>("/farms"),
    backendFetch<FarmFieldRecord[]>("/farm-fields").catch(() => [] as FarmFieldRecord[]),
    fetchMobileNetworkOverview().catch(() => null),
  ]);

  return {
    farmers: (farmers ?? []).map((row) => ({
      id: row.id,
      farmer_name: row.farmer_name?.trim() || "Unnamed farmer",
      village: row.village ?? null,
      district: row.district ?? null,
      mobile_number: row.mobile_number ?? null,
      created_by: row.created_by ?? null,
    })),
    farms: (fields ?? []).map((field) => ({
      id: field.id,
      farmer_id: field.farm_id,
      area: field.calculated_area == null ? null : Number(field.calculated_area),
    })),
    kontikkis: (overview?.kontikkis ?? []).map((row) => ({
      id: row.id,
      registry_name: row.producer?.registry ?? null,
      volume: row.capacity == null ? null : Number(row.capacity),
    })),
  };
}

async function fetchPhoneDirectory(): Promise<PhoneDirectoryPayload> {
  try {
    return await backendFetch<PhoneDirectoryPayload>("/mobile-network/directory");
  } catch (err) {
    if (!directoryRouteMissing(err)) throw err;
    return fetchDirectoryFromExistingRoutes();
  }
}

async function runDirectorySync() {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    throw new Error(
      "You're offline. The saved list stays on this phone until you're back online.",
    );
  }

  const data = await fetchPhoneDirectory();
  const db = await getDb();
  const previous = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM directory_farmers",
  );
  if ((data.farmers?.length ?? 0) === 0 && (previous?.n ?? 0) > 0) {
    throw new Error(
      "The server returned no farmers. Kept the list already saved on this phone.",
    );
  }

  const now = Date.now();
  const keep = new Set((data.farmers ?? []).map((farmer) => farmer.id));

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM directory_farmers");
    await db.runAsync("DELETE FROM directory_farms");
    await db.runAsync("DELETE FROM directory_kontikkis");

    for (const farmer of data.farmers ?? []) {
      const { sql, args } = buildInsert("directory_farmers", {
        id: farmer.id,
        farmer_name: farmer.farmer_name || "Unnamed farmer",
        village: farmer.village ?? null,
        district: farmer.district ?? null,
        mobile_number: farmer.mobile_number ?? null,
        created_by: farmer.created_by ?? null,
        updated_at: now,
      });
      await db.runAsync(sql, args);
    }

    for (const farm of data.farms ?? []) {
      const { sql, args } = buildInsert("directory_farms", {
        id: farm.id,
        farmer_id: farm.farmer_id,
        area: farm.area ?? null,
      });
      await db.runAsync(sql, args);
    }

    for (const kontikki of data.kontikkis ?? []) {
      const { sql, args } = buildInsert("directory_kontikkis", {
        id: kontikki.id,
        registry_name: kontikki.registry_name ?? null,
        volume: kontikki.volume ?? null,
      });
      await db.runAsync(sql, args);
    }

    await db.runAsync(
      "INSERT INTO directory_meta (id, synced_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET synced_at = excluded.synced_at",
      [META_ID, now],
    );

    const locals = await db.getAllAsync<{
      id: string;
      server_id: string | null;
      sync_status: string;
    }>("SELECT id, server_id, sync_status FROM farmers");

    for (const local of locals) {
      if (!local.server_id || keep.has(local.server_id)) continue;
      if (local.sync_status === "pending" || local.sync_status === "syncing" || local.sync_status === "error") {
        continue;
      }
      await db.runAsync("DELETE FROM sync_queue WHERE entity_local_id = ?", [local.id]);
      await db.runAsync("DELETE FROM farmers WHERE id = ?", [local.id]);
    }
  });

  await pullClusterVillages().catch(() => undefined);
  notify();
}

type LocalFarmerRow = {
  id: string;
  server_id: string | null;
  farmer_name: string;
  village: string | null;
  district: string | null;
  mobile_number: string | null;
  created_by: string | null;
  sync_status: string;
  sync_error: string | null;
  farmer_code: string | null;
  farmer_photo_uri: string | null;
  farmer_photo_url: string | null;
};

export async function listPhoneFarmers(): Promise<PhoneFarmerSummary[]> {
  const syncedAt = await readDirectorySyncedAt();
  if (!syncedAt) {
    await syncPhoneDirectory().catch(() => undefined);
  }
  return readPhoneFarmers();
}

async function readPhoneFarmers(): Promise<PhoneFarmerSummary[]> {
  const db = await getDb();
  const [directory, farmCounts, localFieldCounts, locals] = await Promise.all([
    db.getAllAsync<{
      id: string;
      farmer_name: string;
      village: string | null;
      district: string | null;
      mobile_number: string | null;
      created_by: string | null;
    }>("SELECT id, farmer_name, village, district, mobile_number, created_by FROM directory_farmers ORDER BY farmer_name COLLATE NOCASE"),
    db.getAllAsync<{ farmer_id: string; n: number }>(
      "SELECT farmer_id, COUNT(*) AS n FROM directory_farms GROUP BY farmer_id",
    ),
    db.getAllAsync<{ farmer_id: string; n: number }>(
      "SELECT farmer_id, COUNT(*) AS n FROM farm_fields GROUP BY farmer_id",
    ),
    db.getAllAsync<LocalFarmerRow>(
      `SELECT id, server_id, farmer_name, village, district, mobile_number, created_by,
              sync_status, sync_error, farmer_code, farmer_photo_uri, farmer_photo_url
       FROM farmers`,
    ),
  ]);

  const farmsByServer = new Map(farmCounts.map((row) => [row.farmer_id, row.n]));
  const fieldsByLocal = new Map(localFieldCounts.map((row) => [row.farmer_id, row.n]));
  const localByServer = new Map<string, LocalFarmerRow>();
  const pendingByMobile = new Map<string, LocalFarmerRow>();
  for (const local of locals) {
    if (local.server_id) localByServer.set(local.server_id, local);
    const key = mobileKey(local.mobile_number);
    if (!local.server_id && key) pendingByMobile.set(key, local);
  }

  const usedLocal = new Set<string>();
  const summaries: PhoneFarmerSummary[] = [];

  for (const row of directory) {
    const local =
      localByServer.get(row.id) ?? pendingByMobile.get(mobileKey(row.mobile_number)) ?? null;
    if (local) usedLocal.add(local.id);
    const unsynced =
      local != null &&
      (local.sync_status === "pending" ||
        local.sync_status === "syncing" ||
        local.sync_status === "error");
    const source = unsynced && local ? local : null;
    summaries.push({
      id: local?.id ?? row.id,
      serverId: row.id,
      farmer_name: source?.farmer_name || row.farmer_name,
      village: source ? source.village : row.village,
      district: source ? source.district : row.district,
      mobile_number: (source ? source.mobile_number : row.mobile_number) || "",
      created_by: row.created_by ?? local?.created_by ?? null,
      sync_status: local?.sync_status ?? "synced",
      uploadStatus: local?.sync_status ?? "synced",
      sync_error: local?.sync_error ?? null,
      hasFarms: (farmsByServer.get(row.id) ?? 0) > 0 || (local ? (fieldsByLocal.get(local.id) ?? 0) > 0 : false),
      farmer_code: local?.farmer_code ?? null,
      farmer_photo_uri: local?.farmer_photo_uri ?? null,
      farmer_photo_url: local?.farmer_photo_url ?? null,
    });
  }

  for (const local of locals) {
    if (usedLocal.has(local.id)) continue;
    summaries.push({
      id: local.id,
      serverId: local.server_id,
      farmer_name: local.farmer_name,
      village: local.village,
      district: local.district,
      mobile_number: local.mobile_number || "",
      created_by: local.created_by,
      sync_status: local.sync_status,
      uploadStatus: local.sync_status,
      sync_error: local.sync_error,
      hasFarms: (fieldsByLocal.get(local.id) ?? 0) > 0,
      farmer_code: local.farmer_code,
      farmer_photo_uri: local.farmer_photo_uri,
      farmer_photo_url: local.farmer_photo_url,
    });
  }

  summaries.sort((a, b) => a.farmer_name.localeCompare(b.farmer_name));
  return summaries;
}

/** Kontikki ids saved on the phone. Null when the directory has never been downloaded. */
export async function directoryKontikkiIds(): Promise<Set<string> | null> {
  const syncedAt = await readDirectorySyncedAt();
  if (!syncedAt) {
    try {
      await syncPhoneDirectory();
    } catch {
      return null;
    }
  }
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM directory_kontikkis");
  return new Set(rows.map((row) => row.id));
}

/** Area in acres for a plot, from the phone copy or a plot saved on this device. */
export async function areaByFieldId(): Promise<Map<string, number>> {
  const db = await getDb();
  const map = new Map<string, number>();
  const local = await db.getAllAsync<{
    id: string;
    server_id: string | null;
    calculated_area: number | null;
  }>("SELECT id, server_id, calculated_area FROM farm_fields");
  for (const row of local) {
    if (row.calculated_area == null) continue;
    map.set(row.id, Number(row.calculated_area));
    if (row.server_id) map.set(row.server_id, Number(row.calculated_area));
  }
  const directory = await db.getAllAsync<{ id: string; area: number | null }>(
    "SELECT id, area FROM directory_farms",
  );
  for (const row of directory) {
    if (row.area == null || map.has(row.id)) continue;
    map.set(row.id, Number(row.area));
  }
  return map;
}

function mobileKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function cropsFromRemote(crops: unknown): FarmerCrop[] {
  if (!Array.isArray(crops)) return [];
  return crops.map((crop) => {
    const row = crop as Record<string, unknown>;
    return {
      crop_name: String(row.crop_name ?? row.crop ?? ""),
      crop_area: Number(row.crop_area ?? row.acreage ?? 0),
      sowing_date: String(row.sowing_date ?? ""),
      harvest_date: String(row.harvest_date ?? row.estimated_harvest_date ?? ""),
      biomass_rate: row.biomass_rate != null ? Number(row.biomass_rate) : undefined,
    };
  });
}

function remoteToStored(remote: ServerFarmer): Record<string, unknown> {
  return farmerToRow({
    serverId: remote.id,
    farmerCode: remote.farmer_code ?? null,
    farmerName: remote.farmer_name || "Unnamed farmer",
    fatherSpouseName: remote.father_spouse_name ?? null,
    agriId: remote.agri_id ?? null,
    mobileNumber: remote.mobile_number || "",
    latitude: Number(remote.latitude ?? 0),
    longitude: Number(remote.longitude ?? 0),
    address: remote.address || "",
    village: remote.village ?? null,
    mandal: remote.mandal ?? null,
    district: remote.district ?? null,
    state: remote.state ?? null,
    clusterId: remote.cluster_id ?? remote.cluster?.id ?? null,
    clusterVillageId: remote.cluster_village_id ?? null,
    clusterName: remote.cluster?.name ?? null,
    totalLandSize: Number(remote.total_land_size ?? 0),
    ownedLandSize: remote.owned_land_size ?? null,
    leasedLandSize: remote.leased_land_size ?? null,
    crops: cropsFromRemote(remote.crops),
    interestedInBiochar: Boolean(remote.interested_in_biochar),
    priorBiocharExp: Boolean(remote.prior_biochar_exp),
    priorBiocharAcreage: remote.prior_biochar_acreage ?? null,
    estimatedBiomass: Number(remote.estimated_biomass ?? 0),
    farmerPhotoUri: remote.farmer_photo_url ?? null,
    farmerPhotoUrl: remote.farmer_photo_url ?? null,
    creditRightsAcknowledged: Boolean(remote.credit_rights_acknowledged),
    createdBy: remote.created_by || "",
    assignedTo: remote.assigned_to || remote.created_by || "",
    uploadStatus: "synced",
    syncError: null,
    createdAt: remote.created_at ? new Date(remote.created_at).getTime() : Date.now(),
    updatedAt: remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now(),
  });
}

/**
 * Full farmer profile and that farmer's plots. Lists use the directory;
 * opening one farmer is what downloads the rest, then keeps it on the phone.
 */
export async function ensureFarmerDetails(farmerId: string): Promise<Farmer> {
  const db = await getDb();
  const byId = await db.getFirstAsync<any>("SELECT * FROM farmers WHERE id = ?", [farmerId]);
  const byServer = byId
    ? null
    : await db.getFirstAsync<any>("SELECT * FROM farmers WHERE server_id = ?", [farmerId]);
  const local = byId || byServer ? rowToFarmer(byId ?? byServer) : null;

  if (local && (local.uploadStatus === "pending" || local.uploadStatus === "syncing" || local.uploadStatus === "error")) {
    return local;
  }

  const serverId = local?.serverId || farmerId;
  let remote: ServerFarmer;
  try {
    remote = await backendFetch<ServerFarmer>(`/farms/${serverId}`);
  } catch (err) {
    if (local) return local;
    throw err instanceof Error ? err : new Error("Could not download this farmer.");
  }

  const stored = remoteToStored(remote);
  const localId = local?.id ?? remote.id;
  if (local) {
    const { sql, args } = buildUpdate("farmers", stored, "id = ?", [localId]);
    await db.runAsync(sql, args);
  } else {
    const { sql, args } = buildInsert("farmers", { id: localId, ...stored });
    await db.runAsync(sql, args);
  }

  await pullFarmFieldsForFarmer(localId).catch(() => undefined);

  const saved = await db.getFirstAsync<any>("SELECT * FROM farmers WHERE id = ?", [localId]);
  if (!saved) throw new Error("Could not save this farmer on the phone.");
  return rowToFarmer(saved);
}
