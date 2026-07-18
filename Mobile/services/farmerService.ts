import { Q } from "@nozbe/watermelondb";
import {
  calculateEstimatedBiomass,
  normalizeMobileNumber,
  type FarmerForm,
} from "@krishecarbon/shared";
import { database } from "../database";
import Farmer from "../database/models/Farmer";
import SyncQueue from "../database/models/SyncQueue";

function farmersCollection() {
  return database.get<Farmer>("farmers");
}

function syncQueueCollection() {
  return database.get<SyncQueue>("sync_queue");
}

function userScopeQuery(userId: string) {
  return Q.or(
    Q.where("created_by", userId),
    Q.where("assigned_to", userId),
  );
}

export async function getAllFarmersLocal(userId: string) {
  return farmersCollection()
    .query(userScopeQuery(userId), Q.sortBy("created_at", Q.desc))
    .fetch();
}

export async function getFarmerByIdLocal(id: string) {
  return farmersCollection().find(id);
}

export async function saveFarmerLocal(
  form: FarmerForm,
  userId: string,
  existingId: string | null = null,
) {
  const now = Date.now();
  const estimatedBiomass = calculateEstimatedBiomass(form.crops);
  const crops = form.crops;

  let farmerId = existingId;
  let syncOperation: "create" | "update" | null = null;

  await database.write(async () => {
    if (existingId) {
      const farmer = await farmersCollection().find(existingId);
      syncOperation = farmer.serverId ? "update" : "create";

      await farmer.update((record) => {
        record.farmerName = form.farmer_name.trim();
        record.mobileNumber = normalizeMobileNumber(form.mobile_number);
        record.latitude = Number(form.latitude);
        record.longitude = Number(form.longitude);
        record.address = form.address!.trim();
        record.totalLandSize = Number(form.total_land_size);
        record.crops = crops;
        record.interestedInBiochar = !!form.interested_in_biochar;
        record.priorBiocharExp = !!form.prior_biochar_exp;
        record.priorBiocharAcreage = form.prior_biochar_exp
          ? Number(form.prior_biochar_acreage)
          : null;
        record.consentDocumentUrl = form.consent_document_url || null;
        record.consentLocalUri = form.consent_local_uri || null;
        record.estimatedBiomass = estimatedBiomass;
        record.uploadStatus = "pending";
        record.syncError = null;
        record.updatedAt = now;
      });
    } else {
      const farmer = await farmersCollection().create((record) => {
        record.farmerName = form.farmer_name.trim();
        record.mobileNumber = normalizeMobileNumber(form.mobile_number);
        record.latitude = Number(form.latitude);
        record.longitude = Number(form.longitude);
        record.address = form.address!.trim();
        record.totalLandSize = Number(form.total_land_size);
        record.crops = crops;
        record.interestedInBiochar = !!form.interested_in_biochar;
        record.priorBiocharExp = !!form.prior_biochar_exp;
        record.priorBiocharAcreage = form.prior_biochar_exp
          ? Number(form.prior_biochar_acreage)
          : null;
        record.consentDocumentUrl = form.consent_document_url || null;
        record.consentLocalUri = form.consent_local_uri || null;
        record.estimatedBiomass = estimatedBiomass;
        record.createdBy = userId;
        record.assignedTo = userId;
        record.uploadStatus = "pending";
        record.createdAt = now;
        record.updatedAt = now;
      });

      farmerId = farmer.id;
      syncOperation = "create";
    }
  });

  if (syncOperation && farmerId) {
    await enqueueSync(farmerId, syncOperation);
  }

  return farmerId;
}

async function enqueueSync(
  entityLocalId: string,
  operation: "create" | "update",
) {
  const existing = await syncQueueCollection()
    .query(
      Q.where("entity_local_id", entityLocalId),
      Q.where("status", "pending"),
    )
    .fetch();

  if (existing.length > 0) {
    await database.write(async () => {
      await existing[0].update((record) => {
        record.operation = operation;
      });
    });
    return;
  }

  await database.write(async () => {
    await syncQueueCollection().create((record) => {
      record.entityType = "farmer";
      record.entityLocalId = entityLocalId;
      record.operation = operation;
      record.status = "pending";
      record.retries = 0;
      record.createdAt = Date.now();
    });
  });
}

export async function getPendingSyncCount(userId: string) {
  return farmersCollection()
    .query(userScopeQuery(userId), Q.where("sync_status", "pending"))
    .fetchCount();
}
