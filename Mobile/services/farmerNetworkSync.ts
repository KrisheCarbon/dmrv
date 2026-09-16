import type {
  FarmFieldRecord,
  FarmerConsentRecord,
  SoilTestRecord,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { backendFetch } from "./backendApi";
import { getFarmerByIdLocal } from "./farmerService";
import {
  getFieldById,
  getSoilTestById,
  saveSoilReportLocal,
} from "./farmersNetworkService";
import { uploadFarmerNetworkPhoto, uploadFarmerNetworkPhotos, uploadSoilReportFile } from "../utils/farmerNetworkPhotoUpload";

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

  const payload = {
    id: field.serverId || undefined,
    farm_id: farmId,
    field_code: field.fieldCode,
    ownership_type: field.ownershipType,
    land_reference: field.landReference,
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
      sync_status = ?,
      sync_error = NULL,
      updated_at = ?
     WHERE id = ?`,
    [
      remote.id,
      JSON.stringify(photos),
      JSON.stringify(cropPhotos),
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
  const farmId = await farmServerIdForFarmer(test.farmerId);
  const db = await getDb();

  const fieldServerIds: string[] = [];
  for (const fieldId of test.fieldIds) {
    const field = await getFieldById(fieldId);
    if (!field.serverId) {
      throw new Error("Sync the selected farms first, then this sample will upload.");
    }
    fieldServerIds.push(field.serverId);
  }

  let samplePhotoUrl = test.samplePhotoUrl;
  if (test.samplePhotoUri) {
    samplePhotoUrl = await uploadFarmerNetworkPhoto(
      test.samplePhotoUri,
      `soil-samples/${test.serverId || test.id}/sample.jpg`,
    );
  }

  let receivePhotoUrl = test.receivePhotoUrl;
  if (test.receivePhotoUri) {
    receivePhotoUrl = await uploadFarmerNetworkPhoto(
      test.receivePhotoUri,
      `soil-samples/${test.serverId || test.id}/receive.jpg`,
    );
  }

  if (!test.serverId || operation === "create") {
    const remote = await backendFetch<SoilTestRecord>("/soil-tests", {
      method: "POST",
      body: JSON.stringify({
        id: test.serverId || undefined,
        farm_id: farmId,
        field_ids: fieldServerIds,
        sample_date: test.sampleDate,
        sample_lat: test.sampleLat,
        sample_lng: test.sampleLng,
        sample_photo_url: samplePhotoUrl,
        submitted_to_supervisor_id: test.submittedToSupervisorId,
        status: test.status,
      }),
    });

    await db.runAsync(
      `UPDATE soil_tests SET
        server_id = ?,
        sample_photo_url = ?,
        status = ?,
        received_at = ?,
        received_by = ?,
        sync_status = ?,
        sync_error = NULL,
        updated_at = ?
       WHERE id = ?`,
      [
        remote.id,
        samplePhotoUrl,
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
    const farm = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM farmers WHERE server_id = ?",
      [test.farm_id],
    );
    if (!farm) continue;

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
          status = ?,
          received_at = ?,
          received_by = ?,
          sample_photo_url = ?,
          receive_photo_url = ?,
          submitted_to_supervisor_id = ?,
          server_id = ?,
          field_ids_json = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          test.status,
          test.received_at ?? null,
          test.received_by ?? null,
          test.sample_photo_url ?? null,
          test.receive_photo_url ?? null,
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
          id, farmer_id, field_id, field_ids_json, crop_id, sample_date,
          sample_lat, sample_lng, sample_location, sample_photo_uri, sample_photo_url,
          lab_source, parameters_json, results_json, notes,
          submitted_to_supervisor_id, submitted_to_supervisor_name,
          collected_by, collected_by_role, status, received_at, received_by,
          received_by_name, server_id, sync_status, sync_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          test.id,
          farm.id,
          fieldLocalIds[0] ?? null,
          JSON.stringify(fieldLocalIds),
          test.sample_date,
          test.sample_lat ?? null,
          test.sample_lng ?? null,
          test.sample_photo_url ?? null,
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
