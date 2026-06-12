import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Q } from "@nozbe/watermelondb";
import { database } from "../database";
import { supabase } from "./supabase";

const MAX_RETRIES = 5;
const SYNC_POLL_MS = 20000;

let syncInProgress = false;
let syncDebounceTimer = null;
let syncChain = Promise.resolve();
let unsubscribeNetInfo = null;
let syncPollInterval = null;
let appStateSubscription = null;

const progressByFarmerId = new Map();
const syncEventListeners = new Set();

function isOnline(net) {
  return net.isConnected === true && net.isInternetReachable !== false;
}

function userScopeQuery(userId) {
  return Q.or(
    Q.where("created_by", userId),
    Q.where("assigned_to", userId)
  );
}

function emitSyncEvent(event) {
  syncEventListeners.forEach((listener) => listener(event));
}

export function subscribeSyncEvents(listener) {
  syncEventListeners.add(listener);
  return () => syncEventListeners.delete(listener);
}

export function getSyncProgressForFarmer(farmerId) {
  return progressByFarmerId.get(farmerId) ?? 0;
}

export function getAllSyncProgress() {
  return Object.fromEntries(progressByFarmerId);
}

function setFarmerProgress(farmerId, progress) {
  progressByFarmerId.set(farmerId, progress);
  emitSyncEvent({ type: "progress", farmerId, progress });
}

function clearFarmerProgress(farmerId) {
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

  appStateSubscription = AppState.addEventListener("change", (nextState) => {
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
  syncChain = syncChain.then(() => runSyncQueue()).catch(() => {});
  return syncChain;
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

    const pendingItems = await database
      .get("sync_queue")
      .query(Q.where("status", "pending"), Q.sortBy("created_at", Q.asc))
      .fetch();

    if (pendingItems.length > 0) {
      result = await processPendingSyncItems(pendingItems, userId);
    }

    await reconcileFarmersWithServer(userId);
    emitSyncEvent({ type: "reconcileComplete" });

    return result;
  } finally {
    syncInProgress = false;
  }
}

async function processPendingSyncItems(pendingItems, userId) {
  emitSyncEvent({ type: "syncStart" });

  let synced = 0;
  let failed = 0;

  for (const item of pendingItems) {
      const farmerId = item.entityLocalId;

      try {
        const farmer = await database.get("farmers").find(farmerId);

        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
          await farmer.update((r) => {
            r.syncStatus = "syncing";
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
        failed += 1;
        clearFarmerProgress(farmerId);
        emitSyncEvent({
          type: "farmerSyncComplete",
          farmerId,
          success: false,
          error: err.message
        });

        const retries = item.retries + 1;

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = err.message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const farmer = await database.get("farmers").find(item.entityLocalId);

          await farmer.update((r) => {
            r.syncStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = err.message;
          });
        });
      }
  }

  emitSyncEvent({ type: "syncEnd", synced, failed });

  return { synced, failed };
}

async function uploadConsentFile(localUri, existingUrl, onProgress) {
  if (!localUri) return existingUrl || null;

  onProgress?.(25);

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const fileName = `consent_${Date.now()}.${ext}`;

  const contentType =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
      ? "image/png"
      : "image/jpeg";

  onProgress?.(40);

  const { error } = await supabase.storage
    .from("consent-documents")
    .upload(fileName, arrayBuffer, { contentType, upsert: false });

  if (error) throw error;

  onProgress?.(55);

  const { data } = supabase.storage
    .from("consent-documents")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

function farmerToPayload(farmer, consentUrl) {
  return {
    farmer_name: farmer.farmerName,
    mobile_number: farmer.mobileNumber,
    latitude: farmer.latitude,
    longitude: farmer.longitude,
    address: farmer.address,
    total_land_size: farmer.totalLandSize,
    crops: farmer.crops,
    interested_in_biochar: farmer.interestedInBiochar,
    prior_biochar_exp: farmer.priorBiocharExp,
    prior_biochar_acreage: farmer.priorBiocharAcreage,
    consent_document_url: consentUrl,
    estimated_biomass: farmer.estimatedBiomass,
    created_by: farmer.createdBy,
    assigned_to: farmer.assignedTo
  };
}

function applyRemoteToLocal(record, remote) {
  record.serverId = remote.id;
  record.farmerName = remote.farmer_name;
  record.mobileNumber = remote.mobile_number;
  record.latitude = remote.latitude;
  record.longitude = remote.longitude;
  record.address = remote.address;
  record.totalLandSize = Number(remote.total_land_size);
  record.crops = remote.crops || [];
  record.interestedInBiochar = remote.interested_in_biochar;
  record.priorBiocharExp = remote.prior_biochar_exp;
  record.priorBiocharAcreage = remote.prior_biochar_acreage;
  record.consentDocumentUrl = remote.consent_document_url;
  record.estimatedBiomass = Number(remote.estimated_biomass);
  record.createdBy = remote.created_by;
  record.assignedTo = remote.assigned_to;
  record.syncStatus = "synced";
  record.syncError = null;
  record.createdAt = new Date(remote.created_at).getTime();
  record.updatedAt = new Date(remote.updated_at).getTime();
}

async function syncCreateFarmer(farmer, userId, onProgress) {
  onProgress?.(15);

  const consentUrl = await uploadConsentFile(
    farmer.consentLocalUri,
    farmer.consentDocumentUrl,
    onProgress
  );

  onProgress?.(65);

  const payload = {
    ...farmerToPayload(farmer, consentUrl),
    created_by: userId,
    assigned_to: userId
  };

  const { data, error } = await supabase
    .from("farmers")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;

  onProgress?.(85);

  await database.write(async () => {
    await farmer.update((r) => {
      r.serverId = data.id;
      r.consentDocumentUrl = consentUrl;
      r.consentLocalUri = null;
      r.syncStatus = "synced";
      r.syncError = null;
      r.updatedAt = Date.now();
    });
  });

  onProgress?.(100);
}

async function syncUpdateFarmer(farmer, userId, onProgress) {
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

  const payload = farmerToPayload(farmer, consentUrl);

  const { error } = await supabase
    .from("farmers")
    .update(payload)
    .eq("id", farmer.serverId);

  if (error) throw error;

  onProgress?.(85);

  await database.write(async () => {
    await farmer.update((r) => {
      r.consentDocumentUrl = consentUrl;
      r.consentLocalUri = null;
      r.syncStatus = "synced";
      r.syncError = null;
      r.updatedAt = Date.now();
    });
  });

  onProgress?.(100);
}

async function deleteFarmerAndQueue(farmer) {
  const items = await database
    .get("sync_queue")
    .query(Q.where("entity_local_id", farmer.id))
    .fetch();

  for (const item of items) {
    await item.destroyPermanently();
  }

  await farmer.destroyPermanently();
}

async function reconcileFarmersWithServer(userId) {
  const { data, error } = await supabase
    .from("farmers")
    .select("*")
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error || !data) return;

  const remoteIds = new Set(data.map((row) => row.id));

  await database.write(async () => {
    const allLocal = await database.get("farmers").query().fetch();

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
        local.syncStatus === "synced"
      ) {
        await deleteFarmerAndQueue(local);
      }
    }

    const userLocals = await database
      .get("farmers")
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

    const pendingWithoutServerId = await database
      .get("farmers")
      .query(userScopeQuery(userId), Q.where("sync_status", "pending"))
      .fetch();

    for (const remote of data) {
      const matched = await database
        .get("farmers")
        .query(Q.where("server_id", remote.id))
        .fetch();

      if (matched.length > 0) {
        const local = matched[0];

        if (
          local.syncStatus === "pending" ||
          local.syncStatus === "syncing"
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
          local.mobileNumber === remote.mobile_number &&
          local.createdBy === userId
      );

      if (pendingMatch) {
        await pendingMatch.update((r) => {
          applyRemoteToLocal(r, remote);
        });

        const queueItems = await database
          .get("sync_queue")
          .query(Q.where("entity_local_id", pendingMatch.id))
          .fetch();

        for (const item of queueItems) {
          await item.destroyPermanently();
        }
        continue;
      }

      await database.get("farmers").create((r) => {
        applyRemoteToLocal(r, remote);
      });
    }

    const doneItems = await database
      .get("sync_queue")
      .query(Q.where("status", "done"))
      .fetch();

    for (const item of doneItems) {
      await item.destroyPermanently();
    }
  });
}

export async function getSyncStatusSummary(userId) {
  if (!userId) {
    const net = await NetInfo.fetch();
    return { pending: 0, errors: 0, online: isOnline(net) };
  }

  const pending = await database
    .get("farmers")
    .query(
      userScopeQuery(userId),
      Q.or(
        Q.where("sync_status", "pending"),
        Q.where("sync_status", "syncing")
      )
    )
    .fetchCount();

  const errors = await database
    .get("farmers")
    .query(userScopeQuery(userId), Q.where("sync_status", "error"))
    .fetchCount();

  const net = await NetInfo.fetch();
  const online = isOnline(net);

  return { pending, errors, online };
}

export async function isFarmerSyncing(farmerId) {
  const farmer = await database.get("farmers").find(farmerId);
  return farmer.syncStatus === "syncing";
}

async function recoverStuckSyncItems() {
  const stuckFarmers = await database
    .get("farmers")
    .query(Q.where("sync_status", "syncing"))
    .fetch();

  const stuckQueue = await database
    .get("sync_queue")
    .query(Q.where("status", "processing"))
    .fetch();

  if (stuckFarmers.length === 0 && stuckQueue.length === 0) return;

  await database.write(async () => {
    for (const farmer of stuckFarmers) {
      await farmer.update((r) => {
        r.syncStatus = "pending";
      });
    }

    for (const item of stuckQueue) {
      await item.update((r) => {
        r.status = "pending";
      });
    }
  });
}
