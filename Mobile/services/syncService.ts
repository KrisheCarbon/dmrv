import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { Q } from "@nozbe/watermelondb";
import type { Farmer as FarmerRow, FarmerCrop, FarmCropRecord, FarmUpsertPayload } from "@krishecarbon/shared";
import { database } from "../database";
import Farmer from "../database/models/Farmer";
import SyncQueue from "../database/models/SyncQueue";
import { backendFetch, clearBackendUrlCache } from "./backendApi";
import PyrolysisSession from "../database/models/PyrolysisSession";
import MixingEntry from "../database/models/MixingEntry";
import ApplicationEntry from "../database/models/ApplicationEntry";
import {
  syncPyrolysisBatch,
} from "./pyrolysisService";
import { syncMixingEntry } from "./mixingService";
import { syncApplicationEntry } from "./applicationService";
import { syncEncryptedKilnBatches } from "./kiln/kilnSyncService";
import {
  buildConsentFileName,
  buildConsentStoragePath,
  extractConsentStoragePath,
  getModuleBucket,
} from "../utils/consentStorage";
import { supabase } from "./supabase";

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

function userScopeQuery(userId: string) {
  return Q.or(
    Q.where("created_by", userId),
    Q.where("assigned_to", userId)
  );
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

function farmersCollection() {
  return database.get<Farmer>("farmers");
}

function syncQueueCollection() {
  return database.get<SyncQueue>("sync_queue");
}

function pyrolysisSessionsCollection() {
  return database.get<PyrolysisSession>("pyrolysis_sessions");
}

function mixingEntriesCollection() {
  return database.get<MixingEntry>("mixing_entries");
}

function applicationEntriesCollection() {
  return database.get<ApplicationEntry>("application_entries");
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

export async function retryFailedFarmSyncs(userId: string) {
  await database.write(async () => {
    const failedFarmers = await farmersCollection()
      .query(userScopeQuery(userId), Q.where("sync_status", "error"))
      .fetch();

    for (const farmer of failedFarmers) {
      await farmer.update((record) => {
        record.uploadStatus = "pending";
        record.syncError = null;
      });

      const queueItems = await syncQueueCollection()
        .query(Q.where("entity_local_id", farmer.id))
        .fetch();

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await item.update((record) => {
          record.status = "pending";
          record.retries = 0;
          record.errorMessage = null;
        });
      }

      if (queueItems.length === 0) {
        await syncQueueCollection().create((record) => {
          record.entityType = "farmer";
          record.entityLocalId = farmer.id;
          record.operation = farmer.serverId ? "update" : "create";
          record.status = "pending";
          record.retries = 0;
          record.createdAt = Date.now();
        });
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

    const pendingItems = await syncQueueCollection()
      .query(Q.where("status", "pending"), Q.sortBy("created_at", Q.asc))
      .fetch();

    if (pendingItems.length > 0) {
      result = await processPendingSyncItems(pendingItems, userId);
    }

    await reconcileFarmersWithServer(userId);
    emitSyncEvent({ type: "reconcileComplete" });

    await syncEncryptedKilnBatches().catch((err) => {
      console.warn("[sync] kiln batch sync failed:", syncErrorMessage(err));
    });

    return result;
  } finally {
    syncInProgress = false;
  }
}

async function processPendingSyncItems(pendingItems: SyncQueue[], userId: string) {
  emitSyncEvent({ type: "syncStart" });

  let synced = 0;
  let failed = 0;

  for (const item of pendingItems) {
    if (item.entityType === "application_entry") {
      try {
        const entry = await applicationEntriesCollection().find(item.entityLocalId);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
          await entry.update((r) => {
            r.uploadStatus = "syncing";
            r.syncError = null;
          });
        });

        syncingApplicationEntryIds.add(entry.id);
        emitSyncEvent({ type: "applicationSyncStart", entryId: entry.id });

        await syncApplicationEntry(entry);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "done";
          });
        });

        syncingApplicationEntryIds.delete(entry.id);
        emitSyncEvent({ type: "applicationSyncComplete", entryId: entry.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] application entry sync failed:", item.entityLocalId, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingApplicationEntryIds.delete(item.entityLocalId);
        emitSyncEvent({
          type: "applicationSyncComplete",
          entryId: item.entityLocalId,
          success: false,
          error: message,
        });

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const entry = await applicationEntriesCollection().find(item.entityLocalId);
          await entry.update((r) => {
            r.uploadStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = message;
          });
        });
      }
      continue;
    }

    if (item.entityType === "mixing_entry") {
      try {
        const entry = await mixingEntriesCollection().find(item.entityLocalId);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
          await entry.update((r) => {
            r.uploadStatus = "syncing";
            r.syncError = null;
          });
        });

        syncingMixingEntryIds.add(entry.id);
        emitSyncEvent({ type: "mixingSyncStart", entryId: entry.id });

        await syncMixingEntry(entry);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "done";
          });
        });

        syncingMixingEntryIds.delete(entry.id);
        emitSyncEvent({ type: "mixingSyncComplete", entryId: entry.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] mixing entry sync failed:", item.entityLocalId, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingMixingEntryIds.delete(item.entityLocalId);
        emitSyncEvent({
          type: "mixingSyncComplete",
          entryId: item.entityLocalId,
          success: false,
          error: message,
        });

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const entry = await mixingEntriesCollection().find(item.entityLocalId);
          await entry.update((r) => {
            r.uploadStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = message;
          });
        });
      }
      continue;
    }

    if (item.entityType === "pyrolysis_session") {
      try {
        const session = await pyrolysisSessionsCollection().find(item.entityLocalId);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
          await session.update((r) => {
            r.uploadStatus = "syncing";
            r.syncError = null;
          });
        });

        syncingPyrolysisSessionIds.add(session.id);
        emitSyncEvent({ type: "pyrolysisSyncStart", sessionId: session.id });

        await syncPyrolysisBatch(session);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "done";
          });
        });

        syncingPyrolysisSessionIds.delete(session.id);
        emitSyncEvent({ type: "pyrolysisSyncComplete", sessionId: session.id, success: true });
        synced += 1;
      } catch (err) {
        const message = syncErrorMessage(err);
        console.warn("[sync] pyrolysis session sync failed:", item.entityLocalId, message);
        failed += 1;
        const retries = item.retries + 1;

        syncingPyrolysisSessionIds.delete(item.entityLocalId);
        emitSyncEvent({
          type: "pyrolysisSyncComplete",
          sessionId: item.entityLocalId,
          success: false,
          error: message,
        });

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const session = await pyrolysisSessionsCollection().find(item.entityLocalId);
          await session.update((r) => {
            r.uploadStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = message;
          });
        });
      }
      continue;
    }

    const farmerId = item.entityLocalId;

      try {
        const farmer = await farmersCollection().find(farmerId);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
          await farmer.update((r) => {
            r.uploadStatus = "syncing";
            r.syncError = null;
          });
        });

        setFarmerProgress(farmerId, 10);
        emitSyncEvent({ type: "farmerSyncStart", farmerId });

        if (item.operation === "create") {
          await syncCreateFarmer(farmer, userId, (p) =>
            setFarmerProgress(farmerId, p)
          );
        } else {
          await syncUpdateFarmer(farmer, userId, (p) =>
            setFarmerProgress(farmerId, p)
          );
        }

        setFarmerProgress(farmerId, 100);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "done";
          });
        });

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

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const farmer = await farmersCollection().find(item.entityLocalId);

          await farmer.update((r) => {
            r.uploadStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = message;
          });
        });
      }
  }

  emitSyncEvent({ type: "syncEnd", synced, failed });

  return { synced, failed };
}

async function uploadConsentFile(
  localUri: string | null,
  existingUrl: string | null,
  onProgress?: (progress: number) => void,
) {
  if (!localUri) return existingUrl || null;

  const net = await NetInfo.fetch();
  if (!canUploadToCloud(net)) {
    throw new Error(
      "Internet required to upload consent documents. Connect to Wi‑Fi or mobile data.",
    );
  }

  onProgress?.(25);

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const farmsBucket = getModuleBucket("farms");
  const storagePath = buildConsentStoragePath(buildConsentFileName(ext));

  const contentType =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
      ? "image/png"
      : "image/jpeg";

  onProgress?.(40);

  const { error } = await supabase.storage
    .from(farmsBucket)
    .upload(storagePath, arrayBuffer, { contentType, upsert: false });

  if (error) throw error;

  onProgress?.(55);

  const { data } = supabase.storage
    .from(farmsBucket)
    .getPublicUrl(storagePath);

  return data.publicUrl;
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
    };
  });
}

function farmerToApiPayload(
  farmer: Farmer,
  consentUrl: string | null,
): FarmUpsertPayload {
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
    consent_document_url: consentUrl,
  };
}

function applyRemoteToLocal(record: Farmer, remote: FarmerRow) {
  record.serverId = remote.id;
  record.farmerName = remote.farmer_name;
  record.mobileNumber = remote.mobile_number;
  record.latitude = remote.latitude;
  record.longitude = remote.longitude;
  record.address = remote.address;
  record.totalLandSize = Number(remote.total_land_size);
  record.crops = cropsFromRemote(remote.crops);
  record.interestedInBiochar = remote.interested_in_biochar;
  record.priorBiocharExp = remote.prior_biochar_exp;
  record.priorBiocharAcreage = remote.prior_biochar_acreage;
  record.consentDocumentUrl = remote.consent_document_url;
  record.estimatedBiomass = Number(remote.estimated_biomass);
  record.createdBy = remote.created_by;
  record.assignedTo = remote.assigned_to;
  record.uploadStatus = "synced";
  record.syncError = null;
  record.createdAt = new Date(remote.created_at).getTime();
  record.updatedAt = new Date(remote.updated_at).getTime();
}

async function syncCreateFarmer(
  farmer: Farmer,
  userId: string,
  onProgress?: (progress: number) => void,
) {
  onProgress?.(15);

  const consentUrl = await uploadConsentFile(
    farmer.consentLocalUri,
    farmer.consentDocumentUrl,
    onProgress
  );

  onProgress?.(65);

  const payload = farmerToApiPayload(farmer, consentUrl);

  const data = await backendFetch<FarmerRow>("/farms", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  onProgress?.(85);

  await database.write(async () => {
    await farmer.update((r) => {
      r.serverId = data.id;
      r.consentDocumentUrl = consentUrl;
      r.consentLocalUri = null;
      r.uploadStatus = "synced";
      r.syncError = null;
      r.updatedAt = Date.now();
    });
  });

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

  onProgress?.(15);

  const consentUrl = await uploadConsentFile(
    farmer.consentLocalUri,
    farmer.consentDocumentUrl,
    onProgress
  );

  onProgress?.(65);

  const payload = farmerToApiPayload(farmer, consentUrl);

  await backendFetch<FarmerRow>(`/farms/${farmer.serverId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  onProgress?.(85);

  await database.write(async () => {
    await farmer.update((r) => {
      r.consentDocumentUrl = consentUrl;
      r.consentLocalUri = null;
      r.uploadStatus = "synced";
      r.syncError = null;
      r.updatedAt = Date.now();
    });
  });

  onProgress?.(100);
}

async function deleteFarmerAndQueue(farmer: Farmer) {
  const items = await syncQueueCollection()
    .query(Q.where("entity_local_id", farmer.id))
    .fetch();

  for (const item of items) {
    await item.destroyPermanently();
  }

  await farmer.destroyPermanently();
}

async function reconcileFarmersWithServer(userId: string) {
  let data: FarmerRow[];

  try {
    data = await backendFetch<FarmerRow[]>("/farms");
  } catch (err) {
    console.warn("[sync] reconcile failed:", syncErrorMessage(err));
    return;
  }

  const remoteIds = new Set(data.map((row) => row.id));

  await database.write(async () => {
    const allLocal = await farmersCollection().query().fetch();

    for (const local of allLocal) {
      const belongsToUser =
        local.createdBy === userId || local.assignedTo === userId;

      if (!belongsToUser) {
        await deleteFarmerAndQueue(local);
        continue;
      }

      if (
        local.serverId &&
        !remoteIds.has(local.serverId) &&
        local.uploadStatus === "synced"
      ) {
        await deleteFarmerAndQueue(local);
      }
    }

    const userLocals = await farmersCollection()
      .query(userScopeQuery(userId))
      .fetch();

    const byServerId = new Map();
    const deletedIds = new Set();

    for (const local of userLocals) {
      if (!local.serverId || deletedIds.has(local.id)) continue;

      const existing = byServerId.get(local.serverId);
      if (!existing) {
        byServerId.set(local.serverId, local);
        continue;
      }

      const keep =
        local.updatedAt >= existing.updatedAt ? local : existing;
      const drop = keep === local ? existing : local;

      await deleteFarmerAndQueue(drop);
      deletedIds.add(drop.id);
      byServerId.set(local.serverId, keep);
    }

    const pendingWithoutServerId = await farmersCollection()
      .query(userScopeQuery(userId), Q.where("sync_status", "pending"))
      .fetch();

    for (const remote of data) {
      const matched = await farmersCollection()
        .query(Q.where("server_id", remote.id))
        .fetch();

      if (matched.length > 0) {
        const local = matched[0];

        if (
          local.uploadStatus === "pending" ||
          local.uploadStatus === "syncing"
        ) {
          continue;
        }

        await local.update((r) => {
          applyRemoteToLocal(r, remote);
        });
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
        await pendingMatch.update((r) => {
          applyRemoteToLocal(r, remote);
        });

        const queueItems = await syncQueueCollection()
          .query(Q.where("entity_local_id", pendingMatch.id))
          .fetch();

        for (const item of queueItems) {
          await item.destroyPermanently();
        }
        continue;
      }

      await farmersCollection().create((r) => {
        applyRemoteToLocal(r, remote);
      });
    }

    const doneItems = await syncQueueCollection()
      .query(Q.where("status", "done"))
      .fetch();

    for (const item of doneItems) {
      await item.destroyPermanently();
    }
  });
}

export async function getSyncStatusSummary(userId: string | undefined) {
  if (!userId) {
    const net = await NetInfo.fetch();
    return { pending: 0, errors: 0, online: isOnline(net) };
  }

  const pending = await farmersCollection()
    .query(
      userScopeQuery(userId),
      Q.or(
        Q.where("sync_status", "pending"),
        Q.where("sync_status", "syncing")
      )
    )
    .fetchCount();

  const errors = await farmersCollection()
    .query(userScopeQuery(userId), Q.where("sync_status", "error"))
    .fetchCount();

  const net = await NetInfo.fetch();
  const online = isOnline(net);

  return { pending, errors, online };
}

export async function isFarmerSyncing(farmerId: string) {
  const farmer = await farmersCollection().find(farmerId);
  return farmer.uploadStatus === "syncing";
}

export async function retryFailedApplicationSyncs() {
  await database.write(async () => {
    const failedEntries = await applicationEntriesCollection()
      .query(Q.where("sync_status", "error"))
      .fetch();

    for (const entry of failedEntries) {
      await entry.update((record) => {
        record.uploadStatus = "pending";
        record.syncError = null;
      });

      const queueItems = await syncQueueCollection()
        .query(
          Q.where("entity_local_id", entry.id),
          Q.where("entity_type", "application_entry"),
        )
        .fetch();

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await item.update((record) => {
          record.status = "pending";
          record.retries = 0;
          record.errorMessage = null;
        });
      }

      if (queueItems.length === 0) {
        await syncQueueCollection().create((record) => {
          record.entityType = "application_entry";
          record.entityLocalId = entry.id;
          record.operation = "create";
          record.status = "pending";
          record.retries = 0;
          record.createdAt = Date.now();
        });
      }
    }
  });
}

export async function retryFailedMixingSyncs() {
  await database.write(async () => {
    const failedEntries = await mixingEntriesCollection()
      .query(Q.where("sync_status", "error"))
      .fetch();

    for (const entry of failedEntries) {
      await entry.update((record) => {
        record.uploadStatus = "pending";
        record.syncError = null;
      });

      const queueItems = await syncQueueCollection()
        .query(
          Q.where("entity_local_id", entry.id),
          Q.where("entity_type", "mixing_entry"),
        )
        .fetch();

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await item.update((record) => {
          record.status = "pending";
          record.retries = 0;
          record.errorMessage = null;
        });
      }

      if (queueItems.length === 0) {
        await syncQueueCollection().create((record) => {
          record.entityType = "mixing_entry";
          record.entityLocalId = entry.id;
          record.operation = "create";
          record.status = "pending";
          record.retries = 0;
          record.createdAt = Date.now();
        });
      }
    }
  });
}

export async function retryFailedPyrolysisSyncs() {
  await database.write(async () => {
    const failedSessions = await pyrolysisSessionsCollection()
      .query(Q.where("sync_status", "error"))
      .fetch();

    for (const session of failedSessions) {
      await session.update((record) => {
        record.uploadStatus = "pending";
        record.syncError = null;
      });

      const queueItems = await syncQueueCollection()
        .query(
          Q.where("entity_local_id", session.id),
          Q.where("entity_type", "pyrolysis_session"),
        )
        .fetch();

      const failedItems = queueItems.filter((item) => item.status === "failed");

      for (const item of failedItems) {
        await item.update((record) => {
          record.status = "pending";
          record.retries = 0;
          record.errorMessage = null;
        });
      }

      if (queueItems.length === 0) {
        await syncQueueCollection().create((record) => {
          record.entityType = "pyrolysis_session";
          record.entityLocalId = session.id;
          record.operation = "complete";
          record.status = "pending";
          record.retries = 0;
          record.createdAt = Date.now();
        });
      }
    }
  });
}

async function recoverStuckSyncItems() {
  const stuckFarmers = await farmersCollection()
    .query(Q.where("sync_status", "syncing"))
    .fetch();

  const stuckPyrolysisSessions = await pyrolysisSessionsCollection()
    .query(Q.where("sync_status", "syncing"))
    .fetch();

  const stuckMixingEntries = await mixingEntriesCollection()
    .query(Q.where("sync_status", "syncing"))
    .fetch();

  const stuckApplicationEntries = await applicationEntriesCollection()
    .query(Q.where("sync_status", "syncing"))
    .fetch();

  const stuckQueue = await syncQueueCollection()
    .query(Q.where("status", "processing"))
    .fetch();

  if (
    stuckFarmers.length === 0 &&
    stuckPyrolysisSessions.length === 0 &&
    stuckMixingEntries.length === 0 &&
    stuckApplicationEntries.length === 0 &&
    stuckQueue.length === 0
  ) {
    return;
  }

  await database.write(async () => {
    for (const farmer of stuckFarmers) {
      await farmer.update((r) => {
        r.uploadStatus = "pending";
      });
    }

    for (const session of stuckPyrolysisSessions) {
      await session.update((r) => {
        r.uploadStatus = "pending";
      });
    }

    for (const entry of stuckMixingEntries) {
      await entry.update((r) => {
        r.uploadStatus = "pending";
      });
    }

    for (const entry of stuckApplicationEntries) {
      await entry.update((r) => {
        r.uploadStatus = "pending";
      });
    }

    for (const item of stuckQueue) {
      await item.update((r) => {
        r.status = "pending";
      });
    }
  });
}
