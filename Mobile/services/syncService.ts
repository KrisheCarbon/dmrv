import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import type {
  Farmer as FarmerRow,
  FarmerCrop,
  FarmCropRecord,
  FarmUpsertPayload,
} from "@krishecarbon/shared";
import { canAccessWebPortal } from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import { farmerToRow, rowToFarmer, syncQueueItemToRow, type Farmer } from "../database/types";
import { getFarmerByIdLocal } from "./farmerService";
import { backendFetch, clearBackendUrlCache } from "./backendApi";
import { getPyrolysisSession, syncPyrolysisBatch } from "./pyrolysisService";
import { getMixingEntry, syncMixingEntry } from "./mixingService";
import { getApplicationEntry, syncApplicationEntry } from "./applicationService";
import { syncEncryptedKilnBatches } from "./kiln/kilnSyncService";
import { supabase } from "./supabase";
import { getUserProfile } from "./userProfile";
import {
  syncFarmField,
  syncFarmerConsent,
  syncSoilTest,
  pullSoilNetworkFromServer,
} from "./farmerNetworkSync";
import { pullClusterVillages } from "./clusterVillageService";
import { uploadFarmerNetworkPhoto } from "../utils/farmerNetworkPhotoUpload";

const MAX_RETRIES = 5;
const SYNC_POLL_MS = 20000;

let syncInProgress = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncChain: Promise<unknown> = Promise.resolve();
let unsubscribeNetInfo: (() => void) | null = null;
let syncPollInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

const progressByFarmerId = new Map<string, number>();
const syncingPyrolysisSessionIds = new Set<string>();
const syncingMixingEntryIds = new Set<string>();
const syncingApplicationEntryIds = new Set<string>();
const syncEventListeners = new Set<(event: Record<string, unknown>) => void>();

function canStartSync(net: NetInfoState) {
  // In dev, allow sync when the device has any link (USB/Wi‑Fi) so local backend works.
  if (__DEV__) {
    return net.isConnected !== false;
  }

  return net.isConnected === true && net.isInternetReachable !== false;
}

export function canUploadToCloud(net: NetInfoState) {
  return net.isConnected === true && net.isInternetReachable !== false;
}

function isOnline(net: NetInfoState) {
  return canStartSync(net);
}

function emitSyncEvent(event: Record<string, unknown>) {
  syncEventListeners.forEach((listener) => listener(event));
}

export function subscribeSyncEvents(listener: (event: Record<string, unknown>) => void) {
  syncEventListeners.add(listener);
  return () => syncEventListeners.delete(listener);
}

export function isPyrolysisSessionSyncing(sessionId: string) {
  return syncingPyrolysisSessionIds.has(sessionId);
}

export function isMixingEntrySyncing(entryId: string) {
  return syncingMixingEntryIds.has(entryId);
}

export function isApplicationEntrySyncing(entryId: string) {
  return syncingApplicationEntryIds.has(entryId);
}

export function getSyncProgressForFarmer(farmerId: string) {
  return progressByFarmerId.get(farmerId) ?? 0;
}

export function getAllSyncProgress() {
  return Object.fromEntries(progressByFarmerId);
}

function setFarmerProgress(farmerId: string, progress: number) {
  progressByFarmerId.set(farmerId, progress);
  emitSyncEvent({ type: "progress", farmerId, progress });
}

function clearFarmerProgress(farmerId: string) {
  progressByFarmerId.delete(farmerId);
  emitSyncEvent({ type: "progress", farmerId, progress: 0 });
}

export function startSyncListener() {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (!state.isConnected) return;

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncDebounceTimer = null;
      processSyncQueue();
    }, 1500);
  });

  appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
    if (nextState === "active") {
      processSyncQueue();
    }
  });

  syncPollInterval = setInterval(() => {
    processSyncQueue();
  }, SYNC_POLL_MS);
}

export function stopSyncListener() {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  if (syncPollInterval) {
    clearInterval(syncPollInterval);
    syncPollInterval = null;
  }

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
}

export function processSyncQueue() {
  clearBackendUrlCache();
  syncChain = syncChain.then(() => runSyncQueue()).catch(() => {});
  return syncChain;
}

export async function retryFailedFarmSyncs(userId: string, role?: string | null) {
  const db = await getDb();
  const seeAll = canAccessWebPortal(role ?? "");

  const failedRows = seeAll
    ? await db.getAllAsync<any>("SELECT * FROM farmers WHERE sync_status = ?", ["error"])
    : await db.getAllAsync<any>(
        "SELECT * FROM farmers WHERE (created_by = ? OR assigned_to = ?) AND sync_status = ?",
        [userId, userId, "error"],
      );
  const failedFarmers = failedRows.map(rowToFarmer);

  await db.withTransactionAsync(async () => {
    for (const farmer of failedFarmers) {
      await db.runAsync(
        "UPDATE farmers SET sync_status = ?, sync_error = NULL WHERE id = ?",
        ["pending", farmer.id],
      );

      const queueItems = await db.getAllAsync<any>(
        "SELECT * FROM sync_queue WHERE entity_local_id = ?",
        [farmer.id],
      );

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await db.runAsync(
          "UPDATE sync_queue SET status = ?, retries = 0, error_message = NULL WHERE id = ?",
          ["pending", item.id],
        );
      }

      if (queueItems.length === 0) {
        const row = syncQueueItemToRow({
          entityType: "farmer",
          entityLocalId: farmer.id,
          operation: farmer.serverId ? "update" : "create",
          status: "pending",
          retries: 0,
          errorMessage: null,
          createdAt: Date.now(),
        });
        const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...row });
        await db.runAsync(sql, args);
      }
    }
  });
}

function syncErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runSyncQueue() {
  if (syncInProgress) return { synced: 0, failed: 0, skipped: true };

  syncInProgress = true;

  try {
    await recoverStuckSyncItems();

    const net = await NetInfo.fetch();
    if (!isOnline(net)) {
      return { synced: 0, failed: 0, offline: true };
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return { synced: 0, failed: 0, noSession: true };
    }

    const userId = session.user.id;
    let result = { synced: 0, failed: 0 };

    const db = await getDb();
    const pendingItems = await db.getAllAsync<any>(
      "SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at ASC",
      ["pending"],
    );

    if (pendingItems.length > 0) {
      result = await processPendingSyncItems(pendingItems, userId);
    }

    await reconcileFarmersWithServer(userId);
    await pullClusterVillages().catch((err) => {
      console.warn("[sync] cluster villages pull failed:", syncErrorMessage(err));
    });
    await pullSoilNetworkFromServer().catch((err) => {
      console.warn("[sync] farmers network pull failed:", syncErrorMessage(err));
    });
    emitSyncEvent({ type: "reconcileComplete" });

    await syncEncryptedKilnBatches().catch((err) => {
      console.warn("[sync] kiln batch sync failed:", syncErrorMessage(err));
    });

    return result;
  } finally {
    syncInProgress = false;
  }
}

async function processPendingSyncItems(pendingItems: any[], userId: string) {
  emitSyncEvent({ type: "syncStart" });

  const db = await getDb();
  let synced = 0;
  let failed = 0;

  for (const item of pendingItems) {
    if (item.entity_type === "application_entry") {
      try {
        const entry = await getApplicationEntry(item.entity_local_id);

        await db.withTransactionAsync(async () => {
          await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
            "processing",
            item.id,
          ]);
          await db.runAsync(
            "UPDATE application_entries SET sync_status = ?, sync_error = NULL WHERE id = ?",
            ["syncing", entry.id],
          );
        });

        syncingApplicationEntryIds.add(entry.id);
        emitSyncEvent({ type: "applicationSyncStart", entryId: entry.id });

        await syncApplicationEntry(entry);

        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", ["done", item.id]);

        syncingApplicationEntryIds.delete(entry.id);
        emitSyncEvent({ type: "applicationSyncComplete", entryId: entry.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] application entry sync failed:", item.entity_local_id, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingApplicationEntryIds.delete(item.entity_local_id);
        emitSyncEvent({
          type: "applicationSyncComplete",
          entryId: item.entity_local_id,
          success: false,
          error: message,
        });

        await db.withTransactionAsync(async () => {
          await db.runAsync(
            "UPDATE sync_queue SET retries = ?, error_message = ?, status = ? WHERE id = ?",
            [retries, message, retries >= MAX_RETRIES ? "failed" : "pending", item.id],
          );

          await db.runAsync(
            "UPDATE application_entries SET sync_status = ?, sync_error = ? WHERE id = ?",
            [retries >= MAX_RETRIES ? "error" : "pending", message, item.entity_local_id],
          );
        });
      }
      continue;
    }

    if (item.entity_type === "mixing_entry") {
      try {
        const entry = await getMixingEntry(item.entity_local_id);

        await db.withTransactionAsync(async () => {
          await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
            "processing",
            item.id,
          ]);
          await db.runAsync(
            "UPDATE mixing_entries SET sync_status = ?, sync_error = NULL WHERE id = ?",
            ["syncing", entry.id],
          );
        });

        syncingMixingEntryIds.add(entry.id);
        emitSyncEvent({ type: "mixingSyncStart", entryId: entry.id });

        await syncMixingEntry(entry);

        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", ["done", item.id]);

        syncingMixingEntryIds.delete(entry.id);
        emitSyncEvent({ type: "mixingSyncComplete", entryId: entry.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] mixing entry sync failed:", item.entity_local_id, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingMixingEntryIds.delete(item.entity_local_id);
        emitSyncEvent({
          type: "mixingSyncComplete",
          entryId: item.entity_local_id,
          success: false,
          error: message,
        });

        await db.withTransactionAsync(async () => {
          await db.runAsync(
            "UPDATE sync_queue SET retries = ?, error_message = ?, status = ? WHERE id = ?",
            [retries, message, retries >= MAX_RETRIES ? "failed" : "pending", item.id],
          );

          await db.runAsync(
            "UPDATE mixing_entries SET sync_status = ?, sync_error = ? WHERE id = ?",
            [retries >= MAX_RETRIES ? "error" : "pending", message, item.entity_local_id],
          );
        });
      }
      continue;
    }

    if (item.entity_type === "pyrolysis_session") {
      try {
        const session = await getPyrolysisSession(item.entity_local_id);

        await db.withTransactionAsync(async () => {
          await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
            "processing",
            item.id,
          ]);
          await db.runAsync(
            "UPDATE pyrolysis_sessions SET sync_status = ?, sync_error = NULL WHERE id = ?",
            ["syncing", session.id],
          );
        });

        syncingPyrolysisSessionIds.add(session.id);
        emitSyncEvent({ type: "pyrolysisSyncStart", sessionId: session.id });

        await syncPyrolysisBatch(session);

        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", ["done", item.id]);

        syncingPyrolysisSessionIds.delete(session.id);
        emitSyncEvent({ type: "pyrolysisSyncComplete", sessionId: session.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] pyrolysis session sync failed:", item.entity_local_id, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingPyrolysisSessionIds.delete(item.entity_local_id);
        emitSyncEvent({
          type: "pyrolysisSyncComplete",
          sessionId: item.entity_local_id,
          success: false,
          error: message,
        });

        await db.withTransactionAsync(async () => {
          await db.runAsync(
            "UPDATE sync_queue SET retries = ?, error_message = ?, status = ? WHERE id = ?",
            [retries, message, retries >= MAX_RETRIES ? "failed" : "pending", item.id],
          );

          await db.runAsync(
            "UPDATE pyrolysis_sessions SET sync_status = ?, sync_error = ? WHERE id = ?",
            [retries >= MAX_RETRIES ? "error" : "pending", message, item.entity_local_id],
          );
        });
      }
      continue;
    }

    if (
      item.entity_type === "field" ||
      item.entity_type === "consent" ||
      item.entity_type === "soil_test"
    ) {
      try {
        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
          "processing",
          item.id,
        ]);

        if (item.entity_type === "field") {
          await syncFarmField(item.entity_local_id, item.operation);
        } else if (item.entity_type === "consent") {
          await syncFarmerConsent(item.entity_local_id);
        } else {
          await syncSoilTest(item.entity_local_id, item.operation);
        }

        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
          "done",
          item.id,
        ]);
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn(
          `[sync] ${item.entity_type} sync failed:`,
          item.entity_local_id,
          message,
        );
        failed += 1;
        const retries = item.retries + 1;
        const table =
          item.entity_type === "field"
            ? "farm_fields"
            : item.entity_type === "consent"
              ? "farmer_consents"
              : "soil_tests";
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            "UPDATE sync_queue SET retries = ?, error_message = ?, status = ? WHERE id = ?",
            [
              retries,
              message,
              retries >= MAX_RETRIES ? "failed" : "pending",
              item.id,
            ],
          );
          await db.runAsync(
            `UPDATE ${table} SET sync_status = ?, sync_error = ? WHERE id = ?`,
            [
              retries >= MAX_RETRIES ? "error" : "pending",
              message,
              item.entity_local_id,
            ],
          );
        });
      }
      continue;
    }

    const farmerId = item.entity_local_id;

    try {
      const farmer = await getFarmerByIdLocal(farmerId);

      await db.withTransactionAsync(async () => {
        await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", [
          "processing",
          item.id,
        ]);
        await db.runAsync(
          "UPDATE farmers SET sync_status = ?, sync_error = NULL WHERE id = ?",
          ["syncing", farmer.id],
        );
      });

      setFarmerProgress(farmerId, 10);
      emitSyncEvent({ type: "farmerSyncStart", farmerId });

      if (item.operation === "create") {
        await syncCreateFarmer(farmer, userId, (p) => setFarmerProgress(farmerId, p));
      } else {
        await syncUpdateFarmer(farmer, userId, (p) => setFarmerProgress(farmerId, p));
      }

      setFarmerProgress(farmerId, 100);

      await db.runAsync("UPDATE sync_queue SET status = ? WHERE id = ?", ["done", item.id]);

      clearFarmerProgress(farmerId);
      emitSyncEvent({ type: "farmerSyncComplete", farmerId, success: true });
      synced += 1;
    } catch (err) {
      const message = syncErrorMessage(err);
      console.warn("[sync] farmer sync failed:", farmerId, message);
      failed += 1;
      clearFarmerProgress(farmerId);
      emitSyncEvent({
        type: "farmerSyncComplete",
        farmerId,
        success: false,
        error: message
      });

      const retries = item.retries + 1;

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          "UPDATE sync_queue SET retries = ?, error_message = ?, status = ? WHERE id = ?",
          [retries, message, retries >= MAX_RETRIES ? "failed" : "pending", item.id],
        );

        await db.runAsync(
          "UPDATE farmers SET sync_status = ?, sync_error = ? WHERE id = ?",
          [retries >= MAX_RETRIES ? "error" : "pending", message, item.entity_local_id],
        );
      });
    }
  }

  emitSyncEvent({ type: "syncEnd", synced, failed });

  return { synced, failed };
}

function cropsToApiFormat(crops: FarmerCrop[]): FarmCropRecord[] {
  return (crops || []).map((crop) => {
    const row = crop as FarmerCrop & {
      crop?: string;
      acreage?: number;
      estimated_harvest_date?: string;
    };

    return {
      crop: row.crop_name || row.crop || "",
      acreage: Number(row.crop_area ?? row.acreage ?? 0),
      sowing_date: row.sowing_date,
      estimated_harvest_date: row.harvest_date || row.estimated_harvest_date || "",
      biomass_rate: row.biomass_rate != null ? Number(row.biomass_rate) : undefined,
    };
  });
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
      biomass_rate:
        row.biomass_rate != null ? Number(row.biomass_rate) : undefined,
    };
  });
}

function farmerToApiPayload(farmer: Farmer): FarmUpsertPayload {
  return {
    farmer_name: farmer.farmerName,
    mobile_number: farmer.mobileNumber,
    latitude: farmer.latitude,
    longitude: farmer.longitude,
    address: farmer.address,
    total_land_size: farmer.totalLandSize,
    crops: cropsToApiFormat(farmer.crops),
    interested_in_biochar: farmer.interestedInBiochar,
    prior_biochar_exp: farmer.priorBiocharExp,
    prior_biochar_acreage: farmer.priorBiocharAcreage,
    estimated_biomass: farmer.estimatedBiomass,
    farmer_code: farmer.farmerCode,
    father_spouse_name: farmer.fatherSpouseName,
    agri_id: farmer.agriId,
    village: farmer.village,
    mandal: farmer.mandal,
    district: farmer.district,
    state: farmer.state,
    cluster_id: farmer.clusterId,
    cluster_village_id: farmer.clusterVillageId,
    owned_land_size: farmer.ownedLandSize,
    leased_land_size: farmer.leasedLandSize,
    farmer_photo_url: farmer.farmerPhotoUrl,
  };
}

function photoExt(uri: string): string {
  return uri.split(".").pop()?.split("?")[0] || "jpg";
}

async function resolveFarmerPhotoUrl(farmer: Farmer): Promise<string | null> {
  const localUri = farmer.farmerPhotoUri?.trim() || "";
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return localUri;
  }
  if (localUri) {
    const folderId = farmer.serverId || farmer.id;
    const photoUrl = await uploadFarmerNetworkPhoto(
      localUri,
      `farmers/${folderId}/profile.${photoExt(localUri)}`,
    );
    const db = await getDb();
    await db.runAsync(
      "UPDATE farmers SET farmer_photo_url = ? WHERE id = ?",
      [photoUrl, farmer.id],
    );
    farmer.farmerPhotoUrl = photoUrl;
    return photoUrl;
  }
  return farmer.farmerPhotoUrl ?? null;
}

function remoteFarmerToRow(remote: FarmerRow): Record<string, unknown> {
  return farmerToRow({
    serverId: remote.id,
    farmerCode: remote.farmer_code ?? null,
    farmerName: remote.farmer_name,
    fatherSpouseName: remote.father_spouse_name ?? null,
    agriId: remote.agri_id ?? null,
    mobileNumber: remote.mobile_number,
    latitude: remote.latitude,
    longitude: remote.longitude,
    address: remote.address,
    village: remote.village ?? null,
    mandal: remote.mandal ?? null,
    district: remote.district ?? null,
    state: remote.state ?? null,
    clusterId: remote.cluster_id ?? remote.cluster?.id ?? null,
    clusterVillageId: remote.cluster_village_id ?? null,
    clusterName: remote.cluster?.name ?? null,
    totalLandSize: Number(remote.total_land_size),
    ownedLandSize: remote.owned_land_size ?? null,
    leasedLandSize: remote.leased_land_size ?? null,
    crops: cropsFromRemote(remote.crops),
    interestedInBiochar: remote.interested_in_biochar,
    priorBiocharExp: remote.prior_biochar_exp,
    priorBiocharAcreage: remote.prior_biochar_acreage,
    estimatedBiomass: Number(remote.estimated_biomass),
    farmerPhotoUri: remote.farmer_photo_url ?? null,
    farmerPhotoUrl: remote.farmer_photo_url ?? null,
    createdBy: remote.created_by,
    assignedTo: remote.assigned_to,
    uploadStatus: "synced",
    syncError: null,
    createdAt: new Date(remote.created_at).getTime(),
    updatedAt: new Date(remote.updated_at).getTime(),
  });
}

async function syncCreateFarmer(
  farmer: Farmer,
  userId: string,
  onProgress?: (progress: number) => void,
) {
  onProgress?.(30);

  const farmerPhotoUrl = await resolveFarmerPhotoUrl(farmer);
  const payload = farmerToApiPayload({ ...farmer, farmerPhotoUrl });

  const data = await backendFetch<FarmerRow>("/farms", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  onProgress?.(85);

  const db = await getDb();
  await db.runAsync(
    "UPDATE farmers SET server_id = ?, sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    [data.id, "synced", Date.now(), farmer.id],
  );

  onProgress?.(100);
}

async function syncUpdateFarmer(
  farmer: Farmer,
  userId: string,
  onProgress?: (progress: number) => void,
) {
  if (!farmer.serverId) {
    await syncCreateFarmer(farmer, userId, onProgress);
    return;
  }

  onProgress?.(30);

  const farmerPhotoUrl = await resolveFarmerPhotoUrl(farmer);
  const payload = farmerToApiPayload({ ...farmer, farmerPhotoUrl });

  await backendFetch<FarmerRow>(`/farms/${farmer.serverId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  onProgress?.(85);

  const db = await getDb();
  await db.runAsync(
    "UPDATE farmers SET sync_status = ?, sync_error = NULL, updated_at = ? WHERE id = ?",
    ["synced", Date.now(), farmer.id],
  );

  onProgress?.(100);
}

async function deleteFarmerAndQueue(db: Awaited<ReturnType<typeof getDb>>, farmerId: string) {
  await db.runAsync("DELETE FROM sync_queue WHERE entity_local_id = ?", [farmerId]);
  await db.runAsync("DELETE FROM farmers WHERE id = ?", [farmerId]);
}

async function reconcileFarmersWithServer(userId: string) {
  let data: FarmerRow[];

  try {
    data = await backendFetch<FarmerRow[]>("/farms");
  } catch (err) {
    console.warn("[sync] reconcile failed:", syncErrorMessage(err));
    return;
  }

  const profile = await getUserProfile();
  const seeAll = canAccessWebPortal(profile?.role ?? "");
  const remoteIds = new Set(data.map((row) => row.id));

  const db = await getDb();

  await db.withTransactionAsync(async () => {
    const allLocalRows = await db.getAllAsync<any>("SELECT * FROM farmers");
    const allLocal = allLocalRows.map(rowToFarmer);

    for (const local of allLocal) {
      const belongsToUser = local.createdBy === userId || local.assignedTo === userId;
      const visibleOnServer = Boolean(local.serverId && remoteIds.has(local.serverId));
      const pendingLocalCreate =
        !local.serverId &&
        (local.uploadStatus === "pending" || local.uploadStatus === "syncing");

      if (visibleOnServer) {
        continue;
      }

      if (pendingLocalCreate && belongsToUser) {
        continue;
      }

      if (!belongsToUser && !seeAll) {
        await deleteFarmerAndQueue(db, local.id);
        continue;
      }

      if (local.serverId && !remoteIds.has(local.serverId) && local.uploadStatus === "synced") {
        await deleteFarmerAndQueue(db, local.id);
      }
    }

    const userLocalsRows = seeAll
      ? await db.getAllAsync<any>("SELECT * FROM farmers")
      : await db.getAllAsync<any>(
          "SELECT * FROM farmers WHERE created_by = ? OR assigned_to = ?",
          [userId, userId],
        );
    const userLocals = userLocalsRows.map(rowToFarmer);

    const byServerId = new Map<string, Farmer>();
    const deletedIds = new Set<string>();

    for (const local of userLocals) {
      if (!local.serverId || deletedIds.has(local.id)) continue;

      const existing = byServerId.get(local.serverId);
      if (!existing) {
        byServerId.set(local.serverId, local);
        continue;
      }

      const keep = local.updatedAt >= existing.updatedAt ? local : existing;
      const drop = keep === local ? existing : local;

      await deleteFarmerAndQueue(db, drop.id);
      deletedIds.add(drop.id);
      byServerId.set(local.serverId, keep);
    }

    const pendingRows = await db.getAllAsync<any>(
      "SELECT * FROM farmers WHERE (created_by = ? OR assigned_to = ?) AND sync_status = ?",
      [userId, userId, "pending"],
    );
    const pendingWithoutServerId = pendingRows.map(rowToFarmer);

    for (const remote of data) {
      const matchedRows = await db.getAllAsync<any>(
        "SELECT * FROM farmers WHERE server_id = ?",
        [remote.id],
      );

      if (matchedRows.length > 0) {
        const local = rowToFarmer(matchedRows[0]);

        if (local.uploadStatus === "pending" || local.uploadStatus === "syncing") {
          continue;
        }

        const row = remoteFarmerToRow(remote);
        const { sql, args } = buildUpdate("farmers", row, "id = ?", [local.id]);
        await db.runAsync(sql, args);
        continue;
      }

      const pendingMatch = pendingWithoutServerId.find(
        (local) =>
          !local.serverId &&
          local.createdBy === userId &&
          local.mobileNumber &&
          remote.mobile_number &&
          local.mobileNumber === remote.mobile_number
      );

      if (pendingMatch) {
        const row = remoteFarmerToRow(remote);
        row.farmer_code = pendingMatch.farmerCode;
        row.father_spouse_name = pendingMatch.fatherSpouseName;
        row.agri_id = pendingMatch.agriId;
        row.village = pendingMatch.village;
        row.mandal = pendingMatch.mandal;
        row.district = pendingMatch.district;
        row.state = pendingMatch.state;
        row.cluster_id = pendingMatch.clusterId;
        row.cluster_village_id = pendingMatch.clusterVillageId;
        row.cluster_name = pendingMatch.clusterName;
        row.owned_land_size = pendingMatch.ownedLandSize;
        row.leased_land_size = pendingMatch.leasedLandSize;
        const { sql, args } = buildUpdate("farmers", row, "id = ?", [pendingMatch.id]);
        await db.runAsync(sql, args);

        await db.runAsync("DELETE FROM sync_queue WHERE entity_local_id = ?", [pendingMatch.id]);
        continue;
      }

      const row = remoteFarmerToRow(remote);
      const { sql, args } = buildInsert("farmers", { id: generateId(), ...row });
      await db.runAsync(sql, args);
    }

    await db.runAsync("DELETE FROM sync_queue WHERE status = ?", ["done"]);
  });
}

export async function getSyncStatusSummary(
  userId: string | undefined,
  role?: string | null,
) {
  if (!userId) {
    const net = await NetInfo.fetch();
    return { pending: 0, errors: 0, online: isOnline(net) };
  }

  const db = await getDb();
  const seeAll = canAccessWebPortal(role ?? "");

  const pendingRow = seeAll
    ? await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE sync_status = ? OR sync_status = ?",
        ["pending", "syncing"],
      )
    : await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE (created_by = ? OR assigned_to = ?) AND (sync_status = ? OR sync_status = ?)",
        [userId, userId, "pending", "syncing"],
      );

  const errorRow = seeAll
    ? await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE sync_status = ?",
        ["error"],
      )
    : await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM farmers WHERE (created_by = ? OR assigned_to = ?) AND sync_status = ?",
        [userId, userId, "error"],
      );

  const pending = pendingRow?.count ?? 0;
  const errors = errorRow?.count ?? 0;

  const net = await NetInfo.fetch();
  const online = isOnline(net);

  return { pending, errors, online };
}

export type EntitySyncTable = "pyrolysis_sessions" | "mixing_entries" | "application_entries";

async function countByStatus(
  table: EntitySyncTable,
  userId: string,
  statuses: string[],
): Promise<number> {
  const db = await getDb();
  const placeholders = statuses.map(() => "?").join(", ");
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE operator_id = ? AND sync_status IN (${placeholders})`,
    [userId, ...statuses],
  );
  return row?.count ?? 0;
}

/**
 * Same shape as `getSyncStatusSummary` (farmers) but for the other
 * operator-scoped tables (pyrolysis/mixing/application) that also need a
 * "dynamic" sync status pill on the Home dashboard. Drafts ("local") are
 * excluded — only entries actually queued for upload count as pending.
 */
export async function getEntitySyncSummary(
  table: EntitySyncTable,
  userId: string | undefined,
) {
  if (!userId) {
    const net = await NetInfo.fetch();
    return { pending: 0, errors: 0, online: isOnline(net) };
  }

  const [pending, errors] = await Promise.all([
    countByStatus(table, userId, ["pending", "syncing"]),
    countByStatus(table, userId, ["error"]),
  ]);

  const net = await NetInfo.fetch();
  const online = isOnline(net);

  return { pending, errors, online };
}

export async function isFarmerSyncing(farmerId: string) {
  const farmer = await getFarmerByIdLocal(farmerId);
  return farmer.uploadStatus === "syncing";
}

export async function retryFailedApplicationSyncs() {
  const db = await getDb();
  const failedRows = await db.getAllAsync<any>(
    "SELECT * FROM application_entries WHERE sync_status = ?",
    ["error"],
  );

  await db.withTransactionAsync(async () => {
    for (const row of failedRows) {
      await db.runAsync(
        "UPDATE application_entries SET sync_status = ?, sync_error = NULL WHERE id = ?",
        ["pending", row.id],
      );

      const queueItems = await db.getAllAsync<any>(
        "SELECT * FROM sync_queue WHERE entity_local_id = ? AND entity_type = ?",
        [row.id, "application_entry"],
      );

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await db.runAsync(
          "UPDATE sync_queue SET status = ?, retries = 0, error_message = NULL WHERE id = ?",
          ["pending", item.id],
        );
      }

      if (queueItems.length === 0) {
        const queueRow = syncQueueItemToRow({
          entityType: "application_entry",
          entityLocalId: row.id,
          operation: "create",
          status: "pending",
          retries: 0,
          errorMessage: null,
          createdAt: Date.now(),
        });
        const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...queueRow });
        await db.runAsync(sql, args);
      }
    }
  });
}

export async function retryFailedMixingSyncs() {
  const db = await getDb();
  const failedRows = await db.getAllAsync<any>(
    "SELECT * FROM mixing_entries WHERE sync_status = ?",
    ["error"],
  );

  await db.withTransactionAsync(async () => {
    for (const row of failedRows) {
      await db.runAsync(
        "UPDATE mixing_entries SET sync_status = ?, sync_error = NULL WHERE id = ?",
        ["pending", row.id],
      );

      const queueItems = await db.getAllAsync<any>(
        "SELECT * FROM sync_queue WHERE entity_local_id = ? AND entity_type = ?",
        [row.id, "mixing_entry"],
      );

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await db.runAsync(
          "UPDATE sync_queue SET status = ?, retries = 0, error_message = NULL WHERE id = ?",
          ["pending", item.id],
        );
      }

      if (queueItems.length === 0) {
        const queueRow = syncQueueItemToRow({
          entityType: "mixing_entry",
          entityLocalId: row.id,
          operation: "create",
          status: "pending",
          retries: 0,
          errorMessage: null,
          createdAt: Date.now(),
        });
        const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...queueRow });
        await db.runAsync(sql, args);
      }
    }
  });
}

export async function retryFailedPyrolysisSyncs() {
  const db = await getDb();
  const failedRows = await db.getAllAsync<any>(
    "SELECT * FROM pyrolysis_sessions WHERE sync_status = ?",
    ["error"],
  );

  await db.withTransactionAsync(async () => {
    for (const row of failedRows) {
      await db.runAsync(
        "UPDATE pyrolysis_sessions SET sync_status = ?, sync_error = NULL WHERE id = ?",
        ["pending", row.id],
      );

      const queueItems = await db.getAllAsync<any>(
        "SELECT * FROM sync_queue WHERE entity_local_id = ? AND entity_type = ?",
        [row.id, "pyrolysis_session"],
      );

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await db.runAsync(
          "UPDATE sync_queue SET status = ?, retries = 0, error_message = NULL WHERE id = ?",
          ["pending", item.id],
        );
      }

      if (queueItems.length === 0) {
        const queueRow = syncQueueItemToRow({
          entityType: "pyrolysis_session",
          entityLocalId: row.id,
          operation: "complete",
          status: "pending",
          retries: 0,
          errorMessage: null,
          createdAt: Date.now(),
        });
        const { sql, args } = buildInsert("sync_queue", { id: generateId(), ...queueRow });
        await db.runAsync(sql, args);
      }
    }
  });
}

async function recoverStuckSyncItems() {
  const db = await getDb();

  const stuckCounts = await Promise.all([
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM farmers WHERE sync_status = ?",
      ["syncing"],
    ),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM pyrolysis_sessions WHERE sync_status = ?",
      ["syncing"],
    ),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM mixing_entries WHERE sync_status = ?",
      ["syncing"],
    ),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM application_entries WHERE sync_status = ?",
      ["syncing"],
    ),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = ?",
      ["processing"],
    ),
  ]);

  const anyStuck = stuckCounts.some((row) => (row?.count ?? 0) > 0);
  if (!anyStuck) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE farmers SET sync_status = ? WHERE sync_status = ?", [
      "pending",
      "syncing",
    ]);
    await db.runAsync("UPDATE pyrolysis_sessions SET sync_status = ? WHERE sync_status = ?", [
      "pending",
      "syncing",
    ]);
    await db.runAsync("UPDATE mixing_entries SET sync_status = ? WHERE sync_status = ?", [
      "pending",
      "syncing",
    ]);
    await db.runAsync("UPDATE application_entries SET sync_status = ? WHERE sync_status = ?", [
      "pending",
      "syncing",
    ]);
    await db.runAsync("UPDATE sync_queue SET status = ? WHERE status = ?", [
      "pending",
      "processing",
    ]);
  });
}
