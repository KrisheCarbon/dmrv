import {
  calculateEstimatedBiomass,
  isFarmerProfileComplete,
  soilSampleToneFromStatuses,
  type FarmerCrop,
  type SoilSampleTone,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  farmCropToRow,
  farmFieldToRow,
  farmerConsentToRow,
  rowToFarmCrop,
  rowToFarmField,
  rowToFarmerConsent,
  rowToSoilReport,
  rowToSoilTest,
  soilReportToRow,
  soilTestToRow,
  syncQueueItemToRow,
  type FarmCropRecord,
  type FarmerConsent,
  type FarmField,
  type FieldOwnership,
  type FieldStatus,
  type SoilReport,
  type SoilTest,
} from "../database/types";

function shortCode(prefix: string): string {
  const id = generateId().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${id}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateFarmerCode(): string {
  return shortCode("FRM");
}

export function generateFieldCode(): string {
  return shortCode("FLD");
}

export function generateCropCode(): string {
  return shortCode("CRP");
}

async function enqueueNetworkSync(
  entityType: "field" | "consent" | "soil_test",
  entityLocalId: string,
  operation: "create" | "update",
) {
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
    entityType,
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

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export type FieldFormInput = {
  ownershipType: FieldOwnership;
  landReference?: string;
  leaseStart?: string;
  leaseEnd?: string;
  status?: FieldStatus;
  latitude?: number | null;
  longitude?: number | null;
  boundaryGeojson?: string | null;
  calculatedArea?: number | null;
  waterSource?: string;
  photos?: string[];
  notes?: string;
  cropName?: string;
  season?: string;
  sowingDate?: string;
  harvestDate?: string;
  cropPhotos?: string[];
};

export async function listFieldsForFarmer(farmerId: string): Promise<FarmField[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM farm_fields WHERE farmer_id = ? ORDER BY created_at DESC",
    [farmerId],
  );
  return rows.map(rowToFarmField);
}

export async function listFarmerIdsWithActiveFields(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ farmer_id: string }>(
    "SELECT DISTINCT farmer_id FROM farm_fields WHERE status = 'active'",
  );
  return new Set(rows.map((row) => row.farmer_id));
}

export async function getFieldById(fieldId: string): Promise<FarmField> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM farm_fields WHERE id = ?", [
    fieldId,
  ]);
  if (!row) throw new Error(`Field ${fieldId} not found`);
  return rowToFarmField(row);
}

export async function sumActiveFieldAcres(
  farmerId: string,
  excludeFieldId?: string | null,
): Promise<number> {
  const fields = await listFieldsForFarmer(farmerId);
  return fields.reduce((sum, field) => {
    if (field.status !== "active") return sum;
    if (excludeFieldId && field.id === excludeFieldId) return sum;
    return sum + Number(field.calculatedArea ?? 0);
  }, 0);
}

export async function remainingCultivatedAcres(
  farmerId: string,
  excludeFieldId?: string | null,
): Promise<{ cap: number; used: number; remaining: number }> {
  const db = await getDb();
  const farmer = await db.getFirstAsync<{ total_land_size: number }>(
    "SELECT total_land_size FROM farmers WHERE id = ?",
    [farmerId],
  );
  const cap = Number(farmer?.total_land_size ?? 0);
  const used = await sumActiveFieldAcres(farmerId, excludeFieldId);
  return { cap, used, remaining: Math.max(cap - used, 0) };
}

export async function saveFieldLocal(
  farmerId: string,
  form: FieldFormInput,
  existingId: string | null = null,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const area = Number(form.calculatedArea ?? 0);
  if (!area || area <= 0) {
    throw new Error("Plot area (acres) is required.");
  }

  const { cap, remaining } = await remainingCultivatedAcres(farmerId, existingId);
  if (cap > 0 && area > remaining + 0.0001) {
    throw new Error(
      `Farm area cannot exceed cultivated land (${cap} acres). ${remaining.toFixed(2)} acres remaining.`,
    );
  }

  if (existingId) {
    const patch = {
      ownership_type: form.ownershipType,
      land_reference: form.landReference?.trim() || null,
      lease_start: form.leaseStart || null,
      lease_end: form.leaseEnd || null,
      status: form.status || "active",
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      boundary_geojson: form.boundaryGeojson ?? null,
      calculated_area: area,
      water_source: form.waterSource?.trim() || null,
      photos_json: JSON.stringify(form.photos ?? []),
      notes: form.notes?.trim() || null,
      crop_name: form.cropName?.trim() || null,
      season: form.season?.trim() || null,
      sowing_date: form.sowingDate || null,
      harvest_date: form.harvestDate || null,
      crop_photos_json: JSON.stringify(form.cropPhotos ?? []),
      sync_status: "pending",
      sync_error: null,
      updated_at: now,
    };
    const { sql, args } = buildUpdate("farm_fields", patch, "id = ?", [existingId]);
    await db.runAsync(sql, args);
    await refreshFarmerLandAndCrops(farmerId);
    await enqueueNetworkSync("field", existingId, "update");
    return existingId;
  }

  const id = generateId();
  const row = farmFieldToRow({
    farmerId,
    fieldCode: generateFieldCode(),
    ownershipType: form.ownershipType,
    landReference: form.landReference?.trim() || null,
    leaseStart: form.leaseStart || null,
    leaseEnd: form.leaseEnd || null,
    status: form.status || "active",
    latitude: form.latitude ?? null,
    longitude: form.longitude ?? null,
    boundaryGeojson: form.boundaryGeojson ?? null,
    calculatedArea: area,
    waterSource: form.waterSource?.trim() || null,
    photos: form.photos ?? [],
    notes: form.notes?.trim() || null,
    cropName: form.cropName?.trim() || null,
    season: form.season?.trim() || null,
    sowingDate: form.sowingDate || null,
    harvestDate: form.harvestDate || null,
    cropPhotos: form.cropPhotos ?? [],
    serverId: null,
    uploadStatus: "pending",
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });
  const { sql, args } = buildInsert("farm_fields", { id, ...row });
  await db.runAsync(sql, args);
  await refreshFarmerLandAndCrops(farmerId);
  await enqueueNetworkSync("field", id, "create");
  return id;
}

export async function setFieldStatus(
  fieldId: string,
  status: FieldStatus,
): Promise<void> {
  const db = await getDb();
  const field = await getFieldById(fieldId);
  await db.runAsync(
    "UPDATE farm_fields SET status = ?, sync_status = ?, updated_at = ? WHERE id = ?",
    [status, "pending", Date.now(), fieldId],
  );
  await refreshFarmerLandAndCrops(field.farmerId);
  await enqueueNetworkSync("field", fieldId, "update");
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------

export type CropFormInput = {
  cropName: string;
  cultivatedArea: number;
  season?: string;
  ownershipType?: string;
  photos?: string[];
  sowingDate?: string;
  harvestDate?: string;
  biomassRate?: number | null;
};

export async function listCropsForField(fieldId: string): Promise<FarmCropRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM farm_crops WHERE field_id = ? ORDER BY created_at DESC",
    [fieldId],
  );
  return rows.map(rowToFarmCrop);
}

export async function listCropsForFarmer(farmerId: string): Promise<FarmCropRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM farm_crops WHERE farmer_id = ? ORDER BY created_at DESC",
    [farmerId],
  );
  return rows.map(rowToFarmCrop);
}

export async function saveCropLocal(
  farmerId: string,
  fieldId: string,
  form: CropFormInput,
  existingId: string | null = null,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const photos = form.photos ?? [];
  if (photos.length > 5) {
    throw new Error("Maximum 5 photographs allowed per crop.");
  }

  if (existingId) {
    const patch = {
      crop_name: form.cropName.trim(),
      cultivated_area: Number(form.cultivatedArea),
      season: form.season?.trim() || null,
      ownership_type: form.ownershipType || null,
      photos_json: JSON.stringify(photos),
      sowing_date: form.sowingDate || null,
      harvest_date: form.harvestDate || null,
      biomass_rate: form.biomassRate ?? null,
      updated_at: now,
    };
    const { sql, args } = buildUpdate("farm_crops", patch, "id = ?", [existingId]);
    await db.runAsync(sql, args);
    await refreshFarmerLandAndCrops(farmerId);
    return existingId;
  }

  const id = generateId();
  const row = farmCropToRow({
    fieldId,
    farmerId,
    cropCode: generateCropCode(),
    cropName: form.cropName.trim(),
    cultivatedArea: Number(form.cultivatedArea),
    season: form.season?.trim() || null,
    ownershipType: form.ownershipType || null,
    photos,
    sowingDate: form.sowingDate || null,
    harvestDate: form.harvestDate || null,
    biomassRate: form.biomassRate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const { sql, args } = buildInsert("farm_crops", { id, ...row });
  await db.runAsync(sql, args);
  await refreshFarmerLandAndCrops(farmerId);
  return id;
}

/** Keep farmer.crops JSON in sync. Do not overwrite cultivated-land cap. */
export async function refreshFarmerLandAndCrops(farmerId: string): Promise<void> {
  const db = await getDb();
  const fields = await listFieldsForFarmer(farmerId);
  const crops = await listCropsForFarmer(farmerId);

  const activeFields = fields.filter((f) => f.status === "active");
  let owned = 0;
  let leased = 0;
  for (const field of activeFields) {
    const area = Number(field.calculatedArea ?? 0);
    if (field.ownershipType === "Owned") owned += area;
    else leased += area;
  }

  const fieldCrops: FarmerCrop[] = activeFields
    .filter((field) => field.cropName)
    .map((field) => ({
      crop_name: field.cropName as string,
      crop_area: String(field.calculatedArea ?? 0),
      sowing_date: field.sowingDate || "",
      harvest_date: field.harvestDate || "",
    }));

  const tableCrops: FarmerCrop[] = crops.map((c) => ({
    crop_name: c.cropName,
    crop_area: String(c.cultivatedArea),
    sowing_date: c.sowingDate || "",
    harvest_date: c.harvestDate || "",
    ...(c.biomassRate != null ? { biomass_rate: c.biomassRate } : {}),
  }));

  const farmerCrops = fieldCrops.length > 0 ? fieldCrops : tableCrops;
  const estimated = calculateEstimatedBiomass(farmerCrops);

  await db.runAsync(
    `UPDATE farmers SET
      crops = ?,
      owned_land_size = ?,
      leased_land_size = ?,
      estimated_biomass = ?,
      sync_status = ?,
      sync_error = NULL,
      updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(farmerCrops),
      owned || null,
      leased || null,
      estimated,
      "pending",
      Date.now(),
      farmerId,
    ],
  );
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export type ConsentFormInput = {
  agreementType: string;
  consentStatus?: string;
  consentDate?: string;
  validFrom?: string;
  validTo: string;
  agreementReference?: string;
  documentUri?: string;
  photos?: string[];
  evidenceNotes?: string;
  fieldId?: string | null;
};

export async function listConsentsForFarmer(
  farmerId: string,
): Promise<FarmerConsent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM farmer_consents WHERE farmer_id = ? ORDER BY consent_date DESC, created_at DESC",
    [farmerId],
  );
  return rows.map(rowToFarmerConsent);
}

export async function getLatestConsent(
  farmerId: string,
): Promise<FarmerConsent | null> {
  const list = await listConsentsForFarmer(farmerId);
  return list[0] ?? null;
}

export function consentExpiryLabel(consent: FarmerConsent | null): string {
  if (!consent) return "No consent";
  if (!consent.validTo) return consent.consentStatus || "Active";
  const today = todayIsoDate();
  if (consent.validTo < today) return `Expired ${consent.validTo}`;
  return `Active until ${consent.validTo}`;
}

export async function saveConsentLocal(
  farmerId: string,
  form: ConsentFormInput,
): Promise<string> {
  if (!form.validTo?.trim()) {
    throw new Error("Document expiry date is required.");
  }
  const photoCount = form.photos?.length ?? 0;
  if (photoCount < 1) {
    throw new Error("Upload at least one document photo.");
  }
  if (photoCount > 2) {
    throw new Error("Maximum 2 document photos.");
  }
  const db = await getDb();
  const now = Date.now();
  const id = generateId();
  const consentDate = form.consentDate || todayIsoDate();
  const row = farmerConsentToRow({
    farmerId,
    fieldId: form.fieldId ?? null,
    agreementType: form.agreementType.trim() || "Farmer consent",
    consentStatus: form.consentStatus || "active",
    consentDate,
    validFrom: form.validFrom || consentDate,
    validTo: form.validTo.trim(),
    agreementReference: form.agreementReference?.trim() || null,
    documentUri: form.documentUri || null,
    photos: form.photos ?? [],
    evidenceNotes: form.evidenceNotes?.trim() || null,
    serverId: null,
    uploadStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });
  const { sql, args } = buildInsert("farmer_consents", { id, ...row });
  await db.runAsync(sql, args);
  await enqueueNetworkSync("consent", id, "create");
  return id;
}

// ---------------------------------------------------------------------------
// Soil
// ---------------------------------------------------------------------------

export type SoilTestFormInput = {
  fieldId?: string | null;
  fieldIds?: string[];
  cropId?: string | null;
  sampleDate?: string;
  sampleLat?: number | null;
  sampleLng?: number | null;
  sampleLocation?: string;
  samplePhotoUri?: string | null;
  labSource?: string;
  parametersText?: string;
  resultsText?: string;
  notes?: string;
  submittedToSupervisorId?: string | null;
  submittedToSupervisorName?: string | null;
  collectedBy?: string | null;
  collectedByRole?: string | null;
  status?: string;
};

export async function listSoilTestsForFarmer(farmerId: string): Promise<SoilTest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_tests WHERE farmer_id = ? ORDER BY sample_date DESC, created_at DESC",
    [farmerId],
  );
  return rows.map(rowToSoilTest);
}

export async function listIncomingSoilSamples(): Promise<SoilTest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_tests WHERE status IN (?, ?) ORDER BY sample_date DESC, created_at DESC",
    ["submitted", "stored"],
  );
  return rows.map(rowToSoilTest);
}

export async function listCollectedSoilSamples(): Promise<SoilTest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_tests WHERE status = ? ORDER BY sample_date DESC, created_at DESC",
    ["collected"],
  );
  return rows.map(rowToSoilTest);
}

export async function listReportableSoilSamples(): Promise<SoilTest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_tests WHERE status IN (?, ?, ?, ?) ORDER BY sample_date DESC, created_at DESC",
    ["accepted", "received", "stored", "reported"],
  );
  return rows.map(rowToSoilTest);
}

export async function listAllSoilTests(): Promise<SoilTest[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_tests ORDER BY sample_date DESC, created_at DESC",
  );
  return rows.map(rowToSoilTest);
}

export async function getSoilTestById(id: string): Promise<SoilTest> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM soil_tests WHERE id = ?", [id]);
  if (!row) throw new Error("Soil sample not found");
  return rowToSoilTest(row);
}

export async function saveSoilTestLocal(
  farmerId: string,
  form: SoilTestFormInput,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const id = generateId();
  const fieldIds = form.fieldIds?.length
    ? form.fieldIds
    : form.fieldId
      ? [form.fieldId]
      : [];
  const isSupervisor =
    form.collectedByRole === "supervisor" ||
    form.collectedByRole === "admin" ||
    form.collectedByRole === "manager";
  const status =
    form.status || (isSupervisor ? "accepted" : "collected");
  const row = soilTestToRow({
    farmerId,
    fieldId: fieldIds[0] ?? null,
    fieldIds,
    cropId: form.cropId ?? null,
    sampleDate: form.sampleDate || todayIsoDate(),
    sampleLat: form.sampleLat ?? null,
    sampleLng: form.sampleLng ?? null,
    sampleLocation: form.sampleLocation?.trim() || null,
    samplePhotoUri: form.samplePhotoUri ?? null,
    samplePhotoUrl: null,
    receivePhotoUri: null,
    receivePhotoUrl: null,
    labSource: form.labSource?.trim() || null,
    parametersJson: form.parametersText?.trim()
      ? JSON.stringify({ notes: form.parametersText.trim() })
      : null,
    resultsJson: form.resultsText?.trim()
      ? JSON.stringify({ notes: form.resultsText.trim() })
      : null,
    notes: form.notes?.trim() || null,
    submittedToSupervisorId: form.submittedToSupervisorId ?? null,
    submittedToSupervisorName: form.submittedToSupervisorName ?? null,
    collectedBy: form.collectedBy ?? null,
    collectedByRole: form.collectedByRole ?? null,
    status,
    receivedAt:
      status === "accepted" || status === "received" || status === "stored"
        ? new Date().toISOString()
        : null,
    receivedBy:
      status === "accepted" || status === "received" || status === "stored"
        ? form.collectedBy ?? null
        : null,
    receivedByName:
      status === "accepted" || status === "received" || status === "stored"
        ? form.submittedToSupervisorName ?? null
        : null,
    serverId: null,
    uploadStatus: "pending",
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });
  const { sql, args } = buildInsert("soil_tests", { id, ...row });
  await db.runAsync(sql, args);
  await enqueueNetworkSync("soil_test", id, "create");
  return id;
}

export async function submitSoilSampleLocal(
  testId: string,
  supervisor: { id: string; name: string },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE soil_tests SET
      submitted_to_supervisor_id = ?,
      submitted_to_supervisor_name = ?,
      status = ?,
      sync_status = ?,
      updated_at = ?
     WHERE id = ?`,
    [supervisor.id, supervisor.name, "submitted", "pending", Date.now(), testId],
  );
  await enqueueNetworkSync("soil_test", testId, "update");
}

export async function reviewSoilSampleLocal(
  testId: string,
  decision: "accept" | "reject" | "store",
  receiver: { id: string; name: string },
  receivePhotoUri?: string | null,
): Promise<void> {
  const status =
    decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "stored";
  const db = await getDb();
  await db.runAsync(
    `UPDATE soil_tests SET
      status = ?,
      received_at = ?,
      received_by = ?,
      received_by_name = ?,
      receive_photo_uri = COALESCE(?, receive_photo_uri),
      sync_status = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      status,
      new Date().toISOString(),
      receiver.id,
      receiver.name,
      receivePhotoUri ?? null,
      "pending",
      Date.now(),
      testId,
    ],
  );
  await enqueueNetworkSync("soil_test", testId, "update");
}

export type SoilReportFormInput = {
  fieldId?: string | null;
  soilTestId?: string | null;
  reportDate?: string;
  source?: string;
  resultsSummary?: string;
  documentUri?: string;
  documentUrl?: string;
  serverId?: string | null;
};

export async function listSoilReportsForFarmer(
  farmerId: string,
): Promise<SoilReport[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM soil_reports WHERE farmer_id = ? ORDER BY report_date DESC, created_at DESC",
    [farmerId],
  );
  return rows.map(rowToSoilReport);
}

export async function saveSoilReportLocal(
  farmerId: string,
  form: SoilReportFormInput,
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const id = generateId();
  const row = soilReportToRow({
    farmerId,
    fieldId: form.fieldId ?? null,
    soilTestId: form.soilTestId ?? null,
    reportDate: form.reportDate || todayIsoDate(),
    source: form.source?.trim() || null,
    resultsSummary: form.resultsSummary?.trim() || null,
    documentUri: form.documentUri || null,
    documentUrl: form.documentUrl || null,
    serverId: form.serverId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const { sql, args } = buildInsert("soil_reports", { id, ...row });
  await db.runAsync(sql, args);
  if (form.soilTestId) {
    await db.runAsync(
      "UPDATE soil_tests SET status = ?, sync_status = ?, updated_at = ? WHERE id = ?",
      ["reported", "pending", Date.now(), form.soilTestId],
    );
    await enqueueNetworkSync("soil_test", form.soilTestId, "update");
  }
  return id;
}

export type FarmerChecklist = {
  farmerId: string;
  hasProfile: boolean;
  hasFields: boolean;
  hasSoilSample: boolean;
  soilSampleTone: SoilSampleTone;
  hasSoilReport: boolean;
  hasConsent: boolean;
};

export async function getFarmersChecklist(
  farmerIds: string[],
): Promise<Record<string, FarmerChecklist>> {
  const result: Record<string, FarmerChecklist> = {};
  for (const farmerId of farmerIds) {
    result[farmerId] = {
      farmerId,
      hasProfile: true,
      hasFields: false,
      hasSoilSample: false,
      soilSampleTone: "none",
      hasSoilReport: false,
      hasConsent: false,
    };
  }
  if (farmerIds.length === 0) return result;

  const db = await getDb();
  const placeholders = farmerIds.map(() => "?").join(",");
  const [profiles, fields, tests, reports, consents] = await Promise.all([
    db.getAllAsync<{
      id: string;
      farmer_name: string | null;
      mobile_number: string | null;
      address: string | null;
      village: string | null;
      cluster_village_id: string | null;
    }>(
      `SELECT id, farmer_name, mobile_number, address, village, cluster_village_id
       FROM farmers WHERE id IN (${placeholders})`,
      farmerIds,
    ),
    db.getAllAsync<{ farmer_id: string }>(
      `SELECT DISTINCT farmer_id FROM farm_fields WHERE farmer_id IN (${placeholders})`,
      farmerIds,
    ),
    db.getAllAsync<{ farmer_id: string; status: string | null }>(
      `SELECT farmer_id, status FROM soil_tests WHERE farmer_id IN (${placeholders})`,
      farmerIds,
    ),
    db.getAllAsync<{ farmer_id: string }>(
      `SELECT DISTINCT farmer_id FROM soil_reports WHERE farmer_id IN (${placeholders})`,
      farmerIds,
    ),
    db.getAllAsync<{ farmer_id: string }>(
      `SELECT DISTINCT farmer_id FROM farmer_consents WHERE farmer_id IN (${placeholders})`,
      farmerIds,
    ),
  ]);

  for (const row of profiles) {
    if (result[row.id]) {
      result[row.id].hasProfile = isFarmerProfileComplete(row);
    }
  }
  const statusesByFarmer: Record<string, string[]> = {};
  for (const row of fields) {
    if (result[row.farmer_id]) result[row.farmer_id].hasFields = true;
  }
  for (const row of tests) {
    if (!result[row.farmer_id]) continue;
    result[row.farmer_id].hasSoilSample = true;
    if (!statusesByFarmer[row.farmer_id]) statusesByFarmer[row.farmer_id] = [];
    if (row.status) statusesByFarmer[row.farmer_id].push(row.status);
  }
  for (const [farmerId, statuses] of Object.entries(statusesByFarmer)) {
    result[farmerId].soilSampleTone = soilSampleToneFromStatuses(statuses);
  }
  for (const row of reports) {
    if (result[row.farmer_id]) result[row.farmer_id].hasSoilReport = true;
  }
  for (const row of consents) {
    if (result[row.farmer_id]) result[row.farmer_id].hasConsent = true;
  }
  return result;
}
