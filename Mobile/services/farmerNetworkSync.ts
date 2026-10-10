import type {
  FarmFieldRecord,
  FarmerConsentRecord,
  SoilSampleSite,
  SoilTestRecord,
} from "@krishecarbon/shared";
import { soilSampleSitesForApi } from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import { farmFieldToRow } from "../database/types";
import { backendFetch } from "./backendApi";
import { getFarmerByIdLocal } from "./farmerService";
import {
  getFieldById,
  getSoilTestById,
  saveSoilReportLocal,
} from "./farmersNetworkService";
import {
  isLocalMediaUri,
  uploadFarmerNetworkPhoto,
  uploadFarmerNetworkPhotos,
  uploadSoilReportFile,
} from "../utils/farmerNetworkPhotoUpload";

async function farmServerIdForFarmer(farmerId: string): Promise<string> {
  const farmer = await getFarmerByIdLocal(farmerId);
  if (!farmer.serverId) {
    throw new Error("Sync the farmer first, then this record will upload.");
  }
  return farmer.serverId;
}

export async function syncFarmField(localId: string, operation: string): Promise<void> {
  const field = await getFieldById(localId);
  const farmId = await farmServerIdForFarmer(field.farmerId);
  const db = await getDb();

  const photos = await uploadFarmerNetworkPhotos(
    field.photos,
    "fields",
    field.serverId || field.id,
    "photo",
  );
  const cropPhotos = await uploadFarmerNetworkPhotos(
    field.cropPhotos,
    "fields",
    field.serverId || field.id,
    "crop",
  );

  let landReference = field.landReference;
  if (isLocalMediaUri(landReference)) {
    const ext = landReference.split(".").pop()?.split("?")[0] || "jpg";
    landReference = await uploadFarmerNetworkPhoto(
      landReference,
      `fields/${field.serverId || field.id}/land-document.${ext}`,
    );
  }

  const payload = {
    id: field.serverId || undefined,
    farm_id: farmId,
    field_code: field.fieldCode,
    ownership_type: field.ownershipType,
    land_reference: landReference,
    lease_start: field.leaseStart,
    lease_end: field.leaseEnd,
    status: field.status,
    latitude: field.latitude,
    longitude: field.longitude,
    boundary_geojson: field.boundaryGeojson,
    calculated_area: field.calculatedArea,
    water_source: field.waterSource,
    photos,
    notes: field.notes,
    crop_name: field.cropName,
    season: field.season,
    sowing_date: field.sowingDate,
    harvest_date: field.harvestDate,
    crop_photos: cropPhotos,
  };

  const remote =
    field.serverId && operation === "update"
      ? await backendFetch<FarmFieldRecord>(`/farm-fields/${field.serverId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await backendFetch<FarmFieldRecord>("/farm-fields", {
          method: "POST",
          body: JSON.stringify(payload),
        });

  await db.runAsync(
    `UPDATE farm_fields SET
      server_id = ?,
      photos_json = ?,
      crop_photos_json = ?,
      land_reference = ?,
      sync_status = ?,
      sync_error = NULL,
      updated_at = ?
     WHERE id = ?`,
    [
      remote.id,
      JSON.stringify(photos),
      JSON.stringify(cropPhotos),
      landReference,
      "synced",
      Date.now(),
      field.id,
    ],
  );
}

export async function syncFarmerConsent(localId: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM farmer_consents WHERE id = ?",
    [localId],
  );
  if (!row) throw new Error("Consent not found");

  const farmer = await getFarmerByIdLocal(row.farmer_id);
  if (!farmer.serverId) {
    throw new Error("Sync the farmer first, then this record will upload.");
  }

  let photos: string[] = [];
  try {
    photos = JSON.parse(row.photos_json || "[]");
  } catch {
    photos = [];
  }
  const uploaded = await uploadFarmerNetworkPhotos(
    photos,
    "consents",
    row.server_id || row.id,
    "photo",
  );

  const remote = await backendFetch<FarmerConsentRecord>("/farmer-consents", {
    method: "POST",
    body: JSON.stringify({
      id: row.server_id || undefined,
      farm_id: farmer.serverId,
      agreement_type: row.agreement_type,
      consent_status: row.consent_status,
      consent_date: row.consent_date,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      agreement_reference: row.agreement_reference,
      photos: uploaded,
      evidence_notes: row.evidence_notes,
    }),
  });

  await db.runAsync(
    `UPDATE farmer_consents SET
      server_id = ?,
      photos_json = ?,
      sync_status = ?,
      updated_at = ?
     WHERE id = ?`,
    [remote.id, JSON.stringify(uploaded), "synced", Date.now(), row.id],
  );
}

export async function syncSoilTest(localId: string, operation: string): Promise<void> {
  const test = await getSoilTestById(localId);
  const db = await getDb();

  let samplePhotoUrl = test.samplePhotoUrl;
  if (test.samplePhotoUri) {
    samplePhotoUrl = await uploadFarmerNetworkPhoto(
      test.samplePhotoUri,
      `soil-samples/${test.serverId || test.id}/sample.jpg`,
    );
  }

  const uploadedSites: SoilSampleSite[] = [];
  for (let i = 0; i < (test.sampleSites ?? []).length; i += 1) {
    const site = test.sampleSites[i];
    let photoUrl = site.photo_url || null;
    const localUri = site.photo_uri;
    if (localUri && !photoUrl) {
      photoUrl = await uploadFarmerNetworkPhoto(
        localUri,
        `soil-samples/${test.serverId || test.id}/point-${i + 1}.jpg`,
      );
    }
    uploadedSites.push({
      ...site,
      photo_uri: localUri || null,
      photo_url: photoUrl,
    });
  }

  let infoSheetPhotoUrl = test.infoSheetPhotoUrl;
  if (test.infoSheetPhotoUri && !infoSheetPhotoUrl) {
    infoSheetPhotoUrl = await uploadFarmerNetworkPhoto(
      test.infoSheetPhotoUri,
      `soil-samples/${test.serverId || test.id}/info-sheet.jpg`,
    );
    await db.runAsync("UPDATE soil_tests SET info_sheet_photo_url = ? WHERE id = ?", [
      infoSheetPhotoUrl,
      test.id,
    ]);
  }

  let receivePhotoUrl = test.receivePhotoUrl;
  if (test.receivePhotoUri) {
    receivePhotoUrl = await uploadFarmerNetworkPhoto(
      test.receivePhotoUri,
      `soil-samples/${test.serverId || test.id}/receive.jpg`,
    );
  }

  if (!test.serverId || operation === "create") {
    const farmId = await farmServerIdForFarmer(test.farmerId);
    const fieldServerIds: string[] = [];
    for (const fieldId of test.fieldIds) {
      const field = await getFieldById(fieldId);
      if (!field.serverId) {
        throw new Error("Sync the selected farms first, then this sample will upload.");
      }
      fieldServerIds.push(field.serverId);
    }

    const remote = await backendFetch<SoilTestRecord>("/soil-tests", {
      method: "POST",
      body: JSON.stringify({
        id: test.serverId || undefined,
        sample_code: test.sampleCode,
        farm_id: farmId,
        field_ids: fieldServerIds,
        sample_date: test.sampleDate,
        sample_lat: test.sampleLat,
        sample_lng: test.sampleLng,
        sample_photo_url: samplePhotoUrl,
        sample_sites: soilSampleSitesForApi(uploadedSites),
        info_sheet_photo_url: infoSheetPhotoUrl,
        submitted_to_supervisor_id: test.submittedToSupervisorId,
        status: test.status,
      }),
    });

    await db.runAsync(
      `UPDATE soil_tests SET
        server_id = ?,
        sample_code = COALESCE(?, sample_code),
        sample_photo_url = ?,
        sample_sites_json = ?,
        status = ?,
        received_at = ?,
        received_by = ?,
        sync_status = ?,
        sync_error = NULL,
        updated_at = ?
       WHERE id = ?`,
      [
        remote.id,
        remote.sample_code ?? null,
        samplePhotoUrl,
        JSON.stringify(uploadedSites),
        remote.status,
        remote.received_at ?? test.receivedAt,
        remote.received_by ?? test.receivedBy,
        "synced",
        Date.now(),
        test.id,
      ],
    );
    return;
  }

  if (test.status === "submitted") {
    await backendFetch(`/soil-tests/${test.serverId}/submit`, {
      method: "PATCH",
      body: JSON.stringify({
        submitted_to_supervisor_id: test.submittedToSupervisorId,
      }),
    });
  } else if (
    test.status === "accepted" ||
    test.status === "rejected" ||
    test.status === "stored" ||
    test.status === "received"
  ) {
    const decision =
      test.status === "rejected"
        ? "reject"
        : test.status === "stored"
          ? "store"
          : "accept";
    await backendFetch(`/soil-tests/${test.serverId}/review`, {
      method: "PATCH",
      body: JSON.stringify({
        decision,
        receive_photo_url: receivePhotoUrl,
      }),
    });
  } else if (test.status === "reported") {
    const report = await db.getFirstAsync<{
      document_uri: string | null;
      document_url: string | null;
    }>(
      "SELECT document_uri, document_url FROM soil_reports WHERE soil_test_id = ? ORDER BY created_at DESC LIMIT 1",
      [test.id],
    );
    let documentUrl = report?.document_url || null;
    if (report?.document_uri) {
      const isPdf = report.document_uri.toLowerCase().includes(".pdf");
      documentUrl = await uploadSoilReportFile(
        report.document_uri,
        `${test.serverId}/report.${isPdf ? "pdf" : "jpg"}`,
        isPdf ? "application/pdf" : "image/jpeg",
      );
      await db.runAsync(
        "UPDATE soil_reports SET document_url = ? WHERE soil_test_id = ?",
        [documentUrl, test.id],
      );
    }
    if (documentUrl) {
      await backendFetch(`/soil-tests/${test.serverId}/report`, {
        method: "PATCH",
        body: JSON.stringify({ document_url: documentUrl, source: "Lab report" }),
      });
    }
  }

  await db.runAsync(
    `UPDATE soil_tests SET
      sample_photo_url = ?,
      receive_photo_url = ?,
      sync_status = ?,
      sync_error = NULL,
      updated_at = ?
     WHERE id = ?`,
    [samplePhotoUrl, receivePhotoUrl, "synced", Date.now(), test.id],
  );
}

function boundaryText(value: FarmFieldRecord["boundary_geojson"]): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Bring down farms (and their mapped boundaries) for farmers on this phone.
 * Without this a phone only knows farms drawn on it, so a farm mapped on
 * another phone or in the portal could not be chosen for soil sampling.
 * Local farms with unsynced edits are left alone.
 */
export async function pullFarmFieldsFromServer(): Promise<void> {
  const remote = await backendFetch<FarmFieldRecord[]>("/farm-fields");
  const db = await getDb();
  for (const field of remote) {
    const farmer = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM farmers WHERE server_id = ?",
      [field.farm_id],
    );
    if (!farmer) continue;

    const existing = await db.getFirstAsync<{ id: string; sync_status: string | null }>(
      "SELECT id, sync_status FROM farm_fields WHERE server_id = ? OR id = ?",
      [field.id, field.id],
    );
    if (existing && existing.sync_status && existing.sync_status !== "synced") continue;

    const now = Date.now();
    const row = farmFieldToRow({
      farmerId: farmer.id,
      fieldCode: field.field_code,
      ownershipType: field.ownership_type as never,
      landReference: field.land_reference ?? null,
      leaseStart: field.lease_start ?? null,
      leaseEnd: field.lease_end ?? null,
      status: field.status as never,
      latitude: field.latitude ?? null,
      longitude: field.longitude ?? null,
      boundaryGeojson: boundaryText(field.boundary_geojson),
      calculatedArea: field.calculated_area ?? null,
      waterSource: field.water_source ?? null,
      photos: field.photos ?? [],
      notes: field.notes ?? null,
      cropName: field.crop_name ?? null,
      season: field.season ?? null,
      sowingDate: field.sowing_date ?? null,
      harvestDate: field.harvest_date ?? null,
      cropPhotos: field.crop_photos ?? [],
      serverId: field.id,
      uploadStatus: "synced",
      syncError: null,
      createdAt: now,
      updatedAt: now,
    });

    if (existing) {
      const { created_at: _created, ...patch } = row;
      const { sql, args } = buildUpdate("farm_fields", patch, "id = ?", [existing.id]);
      await db.runAsync(sql, args);
    } else {
      const { sql, args } = buildInsert("farm_fields", { id: generateId(), ...row });
      await db.runAsync(sql, args);
    }
  }
}

export async function pullSoilNetworkFromServer(): Promise<void> {
  let tests: SoilTestRecord[] = [];
  try {
    tests = await backendFetch<SoilTestRecord[]>("/soil-tests");
  } catch (err) {
    console.warn("[sync] soil tests pull failed:", err);
    return;
  }

  const db = await getDb();
  for (const test of tests) {
    // A supervisor tracks samples from farmers who are not on this phone;
    // keep those under the server farm id with the farmer's name copied in.
    const localFarm = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM farmers WHERE server_id = ?",
      [test.farm_id],
    );
    const farm = localFarm ?? { id: test.farm_id };

    let existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM soil_tests WHERE server_id = ? OR id = ?",
      [test.id, test.id],
    );

    const fieldLocalIds: string[] = [];
    for (const fieldId of test.field_ids ?? []) {
      const localField = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM farm_fields WHERE server_id = ?",
        [fieldId],
      );
      if (localField) fieldLocalIds.push(localField.id);
    }

    if (existing) {
      await db.runAsync(
        `UPDATE soil_tests SET
          sample_code = COALESCE(?, sample_code),
          info_sheet_photo_url = COALESCE(?, info_sheet_photo_url),
          farmer_name = ?,
          farmer_village = ?,
          collected_by_name = ?,
          received_by_name = COALESCE(?, received_by_name),
          status = ?,
          received_at = ?,
          received_by = ?,
          sample_photo_url = ?,
          receive_photo_url = ?,
          sample_sites_json = ?,
          submitted_to_supervisor_id = ?,
          server_id = ?,
          field_ids_json = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          test.sample_code ?? null,
          test.info_sheet_photo_url ?? null,
          test.farm?.farmer_name ?? null,
          test.farm?.village ?? null,
          test.collected_by_user?.full_name ?? null,
          test.received_by_user?.full_name ?? null,
          test.status,
          test.received_at ?? null,
          test.received_by ?? null,
          test.sample_photo_url ?? null,
          test.receive_photo_url ?? null,
          JSON.stringify(test.sample_sites ?? []),
          test.submitted_to_supervisor_id ?? null,
          test.id,
          JSON.stringify(fieldLocalIds),
          Date.now(),
          existing.id,
        ],
      );
    } else {
      await db.runAsync(
        `INSERT INTO soil_tests (
          sample_code, info_sheet_photo_url, farmer_name, farmer_village, collected_by_name,
          id, farmer_id, field_id, field_ids_json, crop_id, sample_date,
          sample_lat, sample_lng, sample_location, sample_photo_uri, sample_photo_url,
          sample_sites_json,
          lab_source, parameters_json, results_json, notes,
          submitted_to_supervisor_id, submitted_to_supervisor_name,
          collected_by, collected_by_role, status, received_at, received_by,
          received_by_name, server_id, sync_status, sync_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          test.sample_code ?? null,
          test.info_sheet_photo_url ?? null,
          test.farm?.farmer_name ?? null,
          test.farm?.village ?? null,
          test.collected_by_user?.full_name ?? null,
          test.id,
          farm.id,
          fieldLocalIds[0] ?? null,
          JSON.stringify(fieldLocalIds),
          test.sample_date,
          test.sample_lat ?? null,
          test.sample_lng ?? null,
          test.sample_photo_url ?? null,
          JSON.stringify(test.sample_sites ?? []),
          test.submitted_to_supervisor_id ?? null,
          test.submitted_to_supervisor?.full_name ?? null,
          test.collected_by ?? null,
          test.collected_by_role ?? null,
          test.status,
          test.received_at ?? null,
          test.received_by ?? null,
          test.received_by_user?.full_name ?? null,
          test.id,
          "synced",
          Date.now(),
          Date.now(),
        ],
      );
      existing = { id: test.id };
    }

    for (const report of test.reports ?? []) {
      if (!report.document_url) continue;
      const have = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM soil_reports WHERE server_id = ? OR document_url = ?",
        [report.id, report.document_url],
      );
      if (have) continue;
      await saveSoilReportLocal(farm.id, {
        soilTestId: existing?.id ?? null,
        reportDate: report.report_date,
        source: report.source ?? undefined,
        resultsSummary: report.results_summary ?? undefined,
        documentUrl: report.document_url ?? undefined,
        serverId: report.id,
      });
    }
  }
}
