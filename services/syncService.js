import NetInfo from "@react-native-community/netinfo";
import { Q } from "@nozbe/watermelondb";
import { database } from "../database";
import { supabase } from "./supabase";

const MAX_RETRIES = 5;

let syncInProgress = false;
let unsubscribeNetInfo = null;

export function startSyncListener() {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      processSyncQueue();
    }
  });
}

export function stopSyncListener() {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}

export async function processSyncQueue() {
  if (syncInProgress) return { synced: 0, failed: 0 };

  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) {
    return { synced: 0, failed: 0, offline: true };
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return { synced: 0, failed: 0, noSession: true };
  }

  syncInProgress = true;
  let synced = 0;
  let failed = 0;

  try {
    const pendingItems = await database
      .get("sync_queue")
      .query(Q.where("status", "pending"), Q.sortBy("created_at", Q.asc))
      .fetch();

    for (const item of pendingItems) {
      try {
        await database.write(async () => {
          await item.update((r) => {
            r.status = "processing";
          });
        });

        const farmer = await database
          .get("farmers")
          .find(item.entityLocalId);

        if (item.operation === "create") {
          await syncCreateFarmer(farmer, session.user.id);
        } else {
          await syncUpdateFarmer(farmer, session.user.id);
        }

        await database.write(async () => {
          await item.update((r) => {
            r.status = "done";
          });
        });

        synced += 1;
      } catch (err) {
        failed += 1;
        const retries = item.retries + 1;

        await database.write(async () => {
          await item.update((r) => {
            r.retries = retries;
            r.errorMessage = err.message;
            r.status = retries >= MAX_RETRIES ? "failed" : "pending";
          });

          const farmer = await database
            .get("farmers")
            .find(item.entityLocalId);

          await farmer.update((r) => {
            r.syncStatus = retries >= MAX_RETRIES ? "error" : "pending";
            r.syncError = err.message;
          });
        });
      }
    }

    await pullRemoteFarmers(session.user.id);
  } finally {
    syncInProgress = false;
  }

  return { synced, failed };
}

async function uploadConsentFile(localUri, existingUrl) {
  if (!localUri) return existingUrl || null;

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

  const { error } = await supabase.storage
    .from("consent-documents")
    .upload(fileName, arrayBuffer, { contentType, upsert: false });

  if (error) throw error;

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

async function syncCreateFarmer(farmer, userId) {
  const consentUrl = await uploadConsentFile(
    farmer.consentLocalUri,
    farmer.consentDocumentUrl
  );

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
}

async function syncUpdateFarmer(farmer, userId) {
  if (!farmer.serverId) {
    await syncCreateFarmer(farmer, userId);
    return;
  }

  const consentUrl = await uploadConsentFile(
    farmer.consentLocalUri,
    farmer.consentDocumentUrl
  );

  const payload = farmerToPayload(farmer, consentUrl);

  const { error } = await supabase
    .from("farmers")
    .update(payload)
    .eq("id", farmer.serverId);

  if (error) throw error;

  await database.write(async () => {
    await farmer.update((r) => {
      r.consentDocumentUrl = consentUrl;
      r.consentLocalUri = null;
      r.syncStatus = "synced";
      r.syncError = null;
      r.updatedAt = Date.now();
    });
  });
}

async function pullRemoteFarmers(userId) {
  const { data, error } = await supabase
    .from("farmers")
    .select("*")
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error || !data) return;

  await database.write(async () => {
    for (const remote of data) {
      const existing = await database
        .get("farmers")
        .query(Q.where("server_id", remote.id))
        .fetch();

      if (existing.length > 0) {
        const local = existing[0];
        if (local.syncStatus === "pending") continue;

        await local.update((r) => {
          r.farmerName = remote.farmer_name;
          r.mobileNumber = remote.mobile_number;
          r.latitude = remote.latitude;
          r.longitude = remote.longitude;
          r.address = remote.address;
          r.totalLandSize = Number(remote.total_land_size);
          r.crops = remote.crops || [];
          r.interestedInBiochar = remote.interested_in_biochar;
          r.priorBiocharExp = remote.prior_biochar_exp;
          r.priorBiocharAcreage = remote.prior_biochar_acreage;
          r.consentDocumentUrl = remote.consent_document_url;
          r.estimatedBiomass = Number(remote.estimated_biomass);
          r.syncStatus = "synced";
          r.updatedAt = new Date(remote.updated_at).getTime();
        });
      } else {
        await database.get("farmers").create((r) => {
          r.serverId = remote.id;
          r.farmerName = remote.farmer_name;
          r.mobileNumber = remote.mobile_number;
          r.latitude = remote.latitude;
          r.longitude = remote.longitude;
          r.address = remote.address;
          r.totalLandSize = Number(remote.total_land_size);
          r.crops = remote.crops || [];
          r.interestedInBiochar = remote.interested_in_biochar;
          r.priorBiocharExp = remote.prior_biochar_exp;
          r.priorBiocharAcreage = remote.prior_biochar_acreage;
          r.consentDocumentUrl = remote.consent_document_url;
          r.estimatedBiomass = Number(remote.estimated_biomass);
          r.createdBy = remote.created_by;
          r.assignedTo = remote.assigned_to;
          r.syncStatus = "synced";
          r.createdAt = new Date(remote.created_at).getTime();
          r.updatedAt = new Date(remote.updated_at).getTime();
        });
      }
    }
  });
}

export async function getSyncStatusSummary() {
  const pending = await database
    .get("farmers")
    .query(Q.where("sync_status", "pending"))
    .fetchCount();

  const errors = await database
    .get("farmers")
    .query(Q.where("sync_status", "error"))
    .fetchCount();

  const net = await NetInfo.fetch();
  const online =
    net.isConnected && net.isInternetReachable !== false;

  return { pending, errors, online };
}
