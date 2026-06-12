import { Q } from "@nozbe/watermelondb";
import { database } from "../database";
import { calculateEstimatedBiomass } from "../utils/biomass";

export async function getAllFarmersLocal() {
  return database
    .get("farmers")
    .query(Q.sortBy("created_at", Q.desc))
    .fetch();
}

export async function getFarmerByIdLocal(id) {
  return database.get("farmers").find(id);
}

export async function saveFarmerLocal(form, userId, existingId = null) {
  const now = Date.now();
  const estimatedBiomass = calculateEstimatedBiomass(form.crops);
  const crops = form.crops;

  let farmerId = existingId;
  let syncOperation = null;

  await database.write(async () => {
    if (existingId) {
      const farmer = await database.get("farmers").find(existingId);
      syncOperation = farmer.serverId ? "update" : "create";

      await farmer.update((record) => {
        record.farmerName = form.farmer_name.trim();
        record.mobileNumber = form.mobile_number.replace(/\D/g, "");
        record.latitude = Number(form.latitude);
        record.longitude = Number(form.longitude);
        record.address = form.address.trim();
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
        record.syncStatus = "pending";
        record.syncError = null;
        record.updatedAt = now;
      });

    } else {
      const farmer = await database.get("farmers").create((record) => {
        record.farmerName = form.farmer_name.trim();
        record.mobileNumber = form.mobile_number.replace(/\D/g, "");
        record.latitude = Number(form.latitude);
        record.longitude = Number(form.longitude);
        record.address = form.address.trim();
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
        record.syncStatus = "pending";
        record.createdAt = now;
        record.updatedAt = now;
      });

      farmerId = farmer.id;
      syncOperation = "create";
    }
  });

  if (syncOperation) {
    await enqueueSync(farmerId, syncOperation);
  }

  return farmerId;
}

async function enqueueSync(entityLocalId, operation) {
  const existing = await database
    .get("sync_queue")
    .query(
      Q.where("entity_local_id", entityLocalId),
      Q.where("status", "pending")
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
    await database.get("sync_queue").create((record) => {
      record.entityType = "farmer";
      record.entityLocalId = entityLocalId;
      record.operation = operation;
      record.status = "pending";
      record.retries = 0;
      record.createdAt = Date.now();
    });
  });
}

export async function getPendingSyncCount() {
  const pendingFarmers = await database
    .get("farmers")
    .query(Q.where("sync_status", "pending"))
    .fetchCount();

  return pendingFarmers;
}
