// Plain row types + snake_case<->camelCase mappers replacing the WatermelonDB
// Model classes in database/models/. Field names on the camelCase interfaces
// intentionally match the old Model property names so call sites elsewhere
// in the app need minimal changes.
import type { FarmerCrop } from "@krishecarbon/shared";
import { fromSqliteBool, toSqliteBool } from "./sqlHelpers";

// ---------------------------------------------------------------------------
// farmers
// ---------------------------------------------------------------------------

export interface Farmer {
  id: string;
  serverId: string | null;
  farmerCode: string | null;
  farmerName: string;
  fatherSpouseName: string | null;
  agriId: string | null;
  mobileNumber: string;
  latitude: number;
  longitude: number;
  address: string;
  village: string | null;
  mandal: string | null;
  district: string | null;
  state: string | null;
  clusterId: string | null;
  clusterVillageId: string | null;
  clusterName: string | null;
  totalLandSize: number;
  ownedLandSize: number | null;
  leasedLandSize: number | null;
  farmerPhotoUri: string | null;
  farmerPhotoUrl: string | null;
  crops: FarmerCrop[];
  interestedInBiochar: boolean;
  priorBiocharExp: boolean;
  priorBiocharAcreage: number | null;
  estimatedBiomass: number;
  createdBy: string;
  assignedTo: string;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface FarmerRowRaw {
  id: string;
  server_id: string | null;
  farmer_code?: string | null;
  farmer_name: string;
  father_spouse_name?: string | null;
  agri_id?: string | null;
  mobile_number: string;
  latitude: number;
  longitude: number;
  address: string;
  village?: string | null;
  mandal?: string | null;
  district?: string | null;
  state?: string | null;
  cluster_id?: string | null;
  cluster_village_id?: string | null;
  cluster_name?: string | null;
  total_land_size: number;
  owned_land_size?: number | null;
  leased_land_size?: number | null;
  farmer_photo_uri?: string | null;
  farmer_photo_url?: string | null;
  crops: string;
  interested_in_biochar: number;
  prior_biochar_exp: number;
  prior_biochar_acreage: number | null;
  estimated_biomass: number;
  created_by: string;
  assigned_to: string;
  sync_status: string;
  sync_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToFarmer(row: FarmerRowRaw): Farmer {
  let crops: FarmerCrop[] = [];
  try {
    const parsed = JSON.parse(row.crops);
    crops = Array.isArray(parsed) ? parsed : [];
  } catch {
    crops = [];
  }

  return {
    id: row.id,
    serverId: row.server_id,
    farmerCode: row.farmer_code ?? null,
    farmerName: row.farmer_name,
    fatherSpouseName: row.father_spouse_name ?? null,
    agriId: row.agri_id ?? null,
    mobileNumber: row.mobile_number,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    village: row.village ?? null,
    mandal: row.mandal ?? null,
    district: row.district ?? null,
    state: row.state ?? null,
    clusterId: row.cluster_id ?? null,
    clusterVillageId: row.cluster_village_id ?? null,
    clusterName: row.cluster_name ?? null,
    totalLandSize: row.total_land_size,
    ownedLandSize: row.owned_land_size ?? null,
    leasedLandSize: row.leased_land_size ?? null,
    farmerPhotoUri: row.farmer_photo_uri ?? null,
    farmerPhotoUrl: row.farmer_photo_url ?? null,
    crops,
    interestedInBiochar: fromSqliteBool(row.interested_in_biochar),
    priorBiocharExp: fromSqliteBool(row.prior_biochar_exp),
    priorBiocharAcreage: row.prior_biochar_acreage,
    estimatedBiomass: row.estimated_biomass,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    uploadStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps every Farmer field except `id` to snake_case columns (for insert/update). */
export function farmerToRow(farmer: Omit<Farmer, "id">): Record<string, unknown> {
  return {
    server_id: farmer.serverId,
    farmer_code: farmer.farmerCode,
    farmer_name: farmer.farmerName,
    father_spouse_name: farmer.fatherSpouseName,
    agri_id: farmer.agriId,
    mobile_number: farmer.mobileNumber,
    latitude: farmer.latitude,
    longitude: farmer.longitude,
    address: farmer.address,
    village: farmer.village,
    mandal: farmer.mandal,
    district: farmer.district,
    state: farmer.state,
    cluster_id: farmer.clusterId,
    cluster_village_id: farmer.clusterVillageId,
    cluster_name: farmer.clusterName,
    total_land_size: farmer.totalLandSize,
    owned_land_size: farmer.ownedLandSize,
    leased_land_size: farmer.leasedLandSize,
    farmer_photo_uri: farmer.farmerPhotoUri,
    farmer_photo_url: farmer.farmerPhotoUrl,
    crops: JSON.stringify(farmer.crops ?? []),
    interested_in_biochar: toSqliteBool(farmer.interestedInBiochar),
    prior_biochar_exp: toSqliteBool(farmer.priorBiocharExp),
    prior_biochar_acreage: farmer.priorBiocharAcreage,
    estimated_biomass: farmer.estimatedBiomass,
    created_by: farmer.createdBy,
    assigned_to: farmer.assignedTo,
    sync_status: farmer.uploadStatus,
    sync_error: farmer.syncError,
    created_at: farmer.createdAt,
    updated_at: farmer.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// farm_fields / farm_crops / farmer_consents / soil_*
// ---------------------------------------------------------------------------

export type FieldOwnership = "Owned" | "Leased";
export type FieldStatus = "active" | "inactive";

export interface FarmField {
  id: string;
  farmerId: string;
  fieldCode: string;
  ownershipType: FieldOwnership;
  landReference: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  status: FieldStatus;
  latitude: number | null;
  longitude: number | null;
  boundaryGeojson: string | null;
  calculatedArea: number | null;
  waterSource: string | null;
  photos: string[];
  notes: string | null;
  cropName: string | null;
  season: string | null;
  sowingDate: string | null;
  harvestDate: string | null;
  cropPhotos: string[];
  serverId: string | null;
  uploadStatus: string | null;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface FarmFieldRowRaw {
  id: string;
  farmer_id: string;
  field_code: string;
  ownership_type: string;
  land_reference: string | null;
  lease_start: string | null;
  lease_end: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  boundary_geojson: string | null;
  calculated_area: number | null;
  water_source: string | null;
  photos_json: string;
  notes: string | null;
  crop_name?: string | null;
  season?: string | null;
  sowing_date?: string | null;
  harvest_date?: string | null;
  crop_photos_json?: string | null;
  server_id?: string | null;
  sync_status?: string | null;
  sync_error?: string | null;
  created_at: number;
  updated_at: number;
}

function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function rowToFarmField(row: FarmFieldRowRaw): FarmField {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    fieldCode: row.field_code,
    ownershipType: row.ownership_type as FieldOwnership,
    landReference: row.land_reference,
    leaseStart: row.lease_start,
    leaseEnd: row.lease_end,
    status: row.status as FieldStatus,
    latitude: row.latitude,
    longitude: row.longitude,
    boundaryGeojson: row.boundary_geojson,
    calculatedArea: row.calculated_area,
    waterSource: row.water_source,
    photos: parsePhotos(row.photos_json),
    notes: row.notes,
    cropName: row.crop_name ?? null,
    season: row.season ?? null,
    sowingDate: row.sowing_date ?? null,
    harvestDate: row.harvest_date ?? null,
    cropPhotos: parsePhotos(row.crop_photos_json),
    serverId: row.server_id ?? null,
    uploadStatus: row.sync_status ?? null,
    syncError: row.sync_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function farmFieldToRow(field: Omit<FarmField, "id">): Record<string, unknown> {
  return {
    farmer_id: field.farmerId,
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
    photos_json: JSON.stringify(field.photos ?? []),
    notes: field.notes,
    crop_name: field.cropName,
    season: field.season,
    sowing_date: field.sowingDate,
    harvest_date: field.harvestDate,
    crop_photos_json: JSON.stringify(field.cropPhotos ?? []),
    server_id: field.serverId,
    sync_status: field.uploadStatus,
    sync_error: field.syncError,
    created_at: field.createdAt,
    updated_at: field.updatedAt,
  };
}

export interface FarmCropRecord {
  id: string;
  fieldId: string;
  farmerId: string;
  cropCode: string;
  cropName: string;
  cultivatedArea: number;
  season: string | null;
  ownershipType: string | null;
  photos: string[];
  sowingDate: string | null;
  harvestDate: string | null;
  biomassRate: number | null;
  createdAt: number;
  updatedAt: number;
}

interface FarmCropRowRaw {
  id: string;
  field_id: string;
  farmer_id: string;
  crop_code: string;
  crop_name: string;
  cultivated_area: number;
  season: string | null;
  ownership_type: string | null;
  photos_json: string;
  sowing_date: string | null;
  harvest_date: string | null;
  biomass_rate: number | null;
  created_at: number;
  updated_at: number;
}

export function rowToFarmCrop(row: FarmCropRowRaw): FarmCropRecord {
  return {
    id: row.id,
    fieldId: row.field_id,
    farmerId: row.farmer_id,
    cropCode: row.crop_code,
    cropName: row.crop_name,
    cultivatedArea: row.cultivated_area,
    season: row.season,
    ownershipType: row.ownership_type,
    photos: parsePhotos(row.photos_json),
    sowingDate: row.sowing_date,
    harvestDate: row.harvest_date,
    biomassRate: row.biomass_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function farmCropToRow(crop: Omit<FarmCropRecord, "id">): Record<string, unknown> {
  return {
    field_id: crop.fieldId,
    farmer_id: crop.farmerId,
    crop_code: crop.cropCode,
    crop_name: crop.cropName,
    cultivated_area: crop.cultivatedArea,
    season: crop.season,
    ownership_type: crop.ownershipType,
    photos_json: JSON.stringify(crop.photos ?? []),
    sowing_date: crop.sowingDate,
    harvest_date: crop.harvestDate,
    biomass_rate: crop.biomassRate,
    created_at: crop.createdAt,
    updated_at: crop.updatedAt,
  };
}

export interface FarmerConsent {
  id: string;
  farmerId: string;
  fieldId: string | null;
  agreementType: string;
  consentStatus: string;
  consentDate: string;
  validFrom: string | null;
  validTo: string | null;
  agreementReference: string | null;
  documentUri: string | null;
  photos: string[];
  evidenceNotes: string | null;
  serverId: string | null;
  uploadStatus: string | null;
  createdAt: number;
  updatedAt: number;
}

interface FarmerConsentRowRaw {
  id: string;
  farmer_id: string;
  field_id: string | null;
  agreement_type: string;
  consent_status: string;
  consent_date: string;
  valid_from: string | null;
  valid_to: string | null;
  agreement_reference: string | null;
  document_uri: string | null;
  photos_json?: string | null;
  evidence_notes: string | null;
  server_id?: string | null;
  sync_status?: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToFarmerConsent(row: FarmerConsentRowRaw): FarmerConsent {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    fieldId: row.field_id,
    agreementType: row.agreement_type,
    consentStatus: row.consent_status,
    consentDate: row.consent_date,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    agreementReference: row.agreement_reference,
    documentUri: row.document_uri,
    photos: parsePhotos(row.photos_json),
    evidenceNotes: row.evidence_notes,
    serverId: row.server_id ?? null,
    uploadStatus: row.sync_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function farmerConsentToRow(
  consent: Omit<FarmerConsent, "id">,
): Record<string, unknown> {
  return {
    farmer_id: consent.farmerId,
    field_id: consent.fieldId,
    agreement_type: consent.agreementType,
    consent_status: consent.consentStatus,
    consent_date: consent.consentDate,
    valid_from: consent.validFrom,
    valid_to: consent.validTo,
    agreement_reference: consent.agreementReference,
    document_uri: consent.documentUri,
    photos_json: JSON.stringify(consent.photos ?? []),
    evidence_notes: consent.evidenceNotes,
    server_id: consent.serverId,
    sync_status: consent.uploadStatus,
    created_at: consent.createdAt,
    updated_at: consent.updatedAt,
  };
}

export interface SoilTest {
  id: string;
  farmerId: string;
  fieldId: string | null;
  fieldIds: string[];
  cropId: string | null;
  sampleDate: string;
  sampleLat: number | null;
  sampleLng: number | null;
  sampleLocation: string | null;
  samplePhotoUri: string | null;
  samplePhotoUrl: string | null;
  receivePhotoUri: string | null;
  receivePhotoUrl: string | null;
  labSource: string | null;
  parametersJson: string | null;
  resultsJson: string | null;
  notes: string | null;
  submittedToSupervisorId: string | null;
  submittedToSupervisorName: string | null;
  collectedBy: string | null;
  collectedByRole: string | null;
  status: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  receivedByName: string | null;
  serverId: string | null;
  uploadStatus: string | null;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SoilTestRowRaw {
  id: string;
  farmer_id: string;
  field_id: string | null;
  field_ids_json?: string | null;
  crop_id: string | null;
  sample_date: string;
  sample_lat: number | null;
  sample_lng: number | null;
  sample_location: string | null;
  sample_photo_uri?: string | null;
  sample_photo_url?: string | null;
  receive_photo_uri?: string | null;
  receive_photo_url?: string | null;
  lab_source: string | null;
  parameters_json: string | null;
  results_json: string | null;
  notes: string | null;
  submitted_to_supervisor_id?: string | null;
  submitted_to_supervisor_name?: string | null;
  collected_by?: string | null;
  collected_by_role?: string | null;
  status?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  received_by_name?: string | null;
  server_id?: string | null;
  sync_status?: string | null;
  sync_error?: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToSoilTest(row: SoilTestRowRaw): SoilTest {
  let fieldIds = parsePhotos(row.field_ids_json);
  if (fieldIds.length === 0 && row.field_id) fieldIds = [row.field_id];

  return {
    id: row.id,
    farmerId: row.farmer_id,
    fieldId: row.field_id ?? fieldIds[0] ?? null,
    fieldIds,
    cropId: row.crop_id,
    sampleDate: row.sample_date,
    sampleLat: row.sample_lat,
    sampleLng: row.sample_lng,
    sampleLocation: row.sample_location,
    samplePhotoUri: row.sample_photo_uri ?? null,
    samplePhotoUrl: row.sample_photo_url ?? null,
    receivePhotoUri: row.receive_photo_uri ?? null,
    receivePhotoUrl: row.receive_photo_url ?? null,
    labSource: row.lab_source,
    parametersJson: row.parameters_json,
    resultsJson: row.results_json,
    notes: row.notes,
    submittedToSupervisorId: row.submitted_to_supervisor_id ?? null,
    submittedToSupervisorName: row.submitted_to_supervisor_name ?? null,
    collectedBy: row.collected_by ?? null,
    collectedByRole: row.collected_by_role ?? null,
    status: row.status ?? null,
    receivedAt: row.received_at ?? null,
    receivedBy: row.received_by ?? null,
    receivedByName: row.received_by_name ?? null,
    serverId: row.server_id ?? null,
    uploadStatus: row.sync_status ?? null,
    syncError: row.sync_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function soilTestToRow(test: Omit<SoilTest, "id">): Record<string, unknown> {
  return {
    farmer_id: test.farmerId,
    field_id: test.fieldId,
    field_ids_json: JSON.stringify(test.fieldIds ?? []),
    crop_id: test.cropId,
    sample_date: test.sampleDate,
    sample_lat: test.sampleLat,
    sample_lng: test.sampleLng,
    sample_location: test.sampleLocation,
    sample_photo_uri: test.samplePhotoUri,
    sample_photo_url: test.samplePhotoUrl,
    receive_photo_uri: test.receivePhotoUri,
    receive_photo_url: test.receivePhotoUrl,
    lab_source: test.labSource,
    parameters_json: test.parametersJson,
    results_json: test.resultsJson,
    notes: test.notes,
    submitted_to_supervisor_id: test.submittedToSupervisorId,
    submitted_to_supervisor_name: test.submittedToSupervisorName,
    collected_by: test.collectedBy,
    collected_by_role: test.collectedByRole,
    status: test.status,
    received_at: test.receivedAt,
    received_by: test.receivedBy,
    received_by_name: test.receivedByName,
    server_id: test.serverId,
    sync_status: test.uploadStatus,
    sync_error: test.syncError,
    created_at: test.createdAt,
    updated_at: test.updatedAt,
  };
}

export interface SoilReport {
  id: string;
  farmerId: string;
  fieldId: string | null;
  soilTestId: string | null;
  reportDate: string;
  source: string | null;
  resultsSummary: string | null;
  documentUri: string | null;
  documentUrl: string | null;
  serverId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SoilReportRowRaw {
  id: string;
  farmer_id: string;
  field_id: string | null;
  soil_test_id: string | null;
  report_date: string;
  source: string | null;
  results_summary: string | null;
  document_uri: string | null;
  document_url?: string | null;
  server_id?: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToSoilReport(row: SoilReportRowRaw): SoilReport {
  return {
    id: row.id,
    farmerId: row.farmer_id,
    fieldId: row.field_id,
    soilTestId: row.soil_test_id,
    reportDate: row.report_date,
    source: row.source,
    resultsSummary: row.results_summary,
    documentUri: row.document_uri,
    documentUrl: row.document_url ?? null,
    serverId: row.server_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function soilReportToRow(report: Omit<SoilReport, "id">): Record<string, unknown> {
  return {
    farmer_id: report.farmerId,
    field_id: report.fieldId,
    soil_test_id: report.soilTestId,
    report_date: report.reportDate,
    source: report.source,
    results_summary: report.resultsSummary,
    document_uri: report.documentUri,
    document_url: report.documentUrl,
    server_id: report.serverId,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// sync_queue
// ---------------------------------------------------------------------------

export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityLocalId: string;
  operation: string;
  status: string;
  retries: number;
  errorMessage: string | null;
  createdAt: number;
}

interface SyncQueueRowRaw {
  id: string;
  entity_type: string;
  entity_local_id: string;
  operation: string;
  status: string;
  retries: number;
  error_message: string | null;
  created_at: number;
}

export function rowToSyncQueueItem(row: SyncQueueRowRaw): SyncQueueItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityLocalId: row.entity_local_id,
    operation: row.operation,
    status: row.status,
    retries: row.retries,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function syncQueueItemToRow(item: Omit<SyncQueueItem, "id">): Record<string, unknown> {
  return {
    entity_type: item.entityType,
    entity_local_id: item.entityLocalId,
    operation: item.operation,
    status: item.status,
    retries: item.retries,
    error_message: item.errorMessage,
    created_at: item.createdAt,
  };
}

// ---------------------------------------------------------------------------
// pyrolysis_sessions
// ---------------------------------------------------------------------------

export interface PyrolysisSession {
  id: string;
  serverId: string | null;
  operatorId: string;
  status: string;
  currentStep: string;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PyrolysisSessionRowRaw {
  id: string;
  server_id: string | null;
  operator_id: string;
  status: string;
  current_step: string;
  sync_status: string;
  sync_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToPyrolysisSession(row: PyrolysisSessionRowRaw): PyrolysisSession {
  return {
    id: row.id,
    serverId: row.server_id,
    operatorId: row.operator_id,
    status: row.status,
    currentStep: row.current_step,
    uploadStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function pyrolysisSessionToRow(
  session: Omit<PyrolysisSession, "id">,
): Record<string, unknown> {
  return {
    server_id: session.serverId,
    operator_id: session.operatorId,
    status: session.status,
    current_step: session.currentStep,
    sync_status: session.uploadStatus,
    sync_error: session.syncError,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// pyrolysis_batches
// ---------------------------------------------------------------------------

export interface PyrolysisBatch {
  id: string;
  sessionId: string;
  serverId: string | null;
  kontikkiId: string;
  kontikkiCode: string;
  producerName: string | null;
  batchNumber: string | null;
  feedstockQuantity: number | null;
  avgFeedstockSizeCm: number | null;
  feedstockId: string | null;
  feedstockName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  feedstockPhotoLocalUri: string | null;
  feedstockPhotoUrl: string | null;
  feedstockSizePhotoLocalUri: string | null;
  feedstockSizePhotoUrl: string | null;
  feedstockPhotoMetadataJson: string | null;
  feedstockSizePhotoMetadataJson: string | null;
  moistureReading1: number | null;
  moistureReading2: number | null;
  moistureReading3: number | null;
  moistureReading4: number | null;
  moistureReading5: number | null;
  moisturePhotoLocalUri1: string | null;
  moisturePhotoLocalUri2: string | null;
  moisturePhotoLocalUri3: string | null;
  moisturePhotoLocalUri4: string | null;
  moisturePhotoLocalUri5: string | null;
  moisturePhotoUrl1: string | null;
  moisturePhotoUrl2: string | null;
  moisturePhotoUrl3: string | null;
  moisturePhotoUrl4: string | null;
  moisturePhotoUrl5: string | null;
  moisturePhotoMetadataJson1: string | null;
  moisturePhotoMetadataJson2: string | null;
  moisturePhotoMetadataJson3: string | null;
  moisturePhotoMetadataJson4: string | null;
  moisturePhotoMetadataJson5: string | null;
  stageInitialPhotoLocalUri: string | null;
  stageMiddlePhotoLocalUri: string | null;
  stageFinalPhotoLocalUri: string | null;
  stageQuenchingPhotoLocalUri: string | null;
  stageInitialPhotoUrl: string | null;
  stageMiddlePhotoUrl: string | null;
  stageFinalPhotoUrl: string | null;
  stageQuenchingPhotoUrl: string | null;
  stageInitialCapturedAt: string | null;
  stageMiddleCapturedAt: string | null;
  stageFinalCapturedAt: string | null;
  stageQuenchingCapturedAt: string | null;
  stageInitialSavedAt: string | null;
  stageMiddleSavedAt: string | null;
  stageFinalSavedAt: string | null;
  stageQuenchingSavedAt: string | null;
  stageInitialPhotoMetadataJson: string | null;
  stageMiddlePhotoMetadataJson: string | null;
  stageFinalPhotoMetadataJson: string | null;
  stageQuenchingPhotoMetadataJson: string | null;
  infoCompleted: boolean;
  moistureCompleted: boolean;
  pyrolysisCompleted: boolean;
  infoSavedAt: string | null;
  moistureSavedAt: string | null;
  pyrolysisSavedAt: string | null;
  yieldSavedAt: string | null;
  yieldPercent: number | null;
  comment: string | null;
  sampleId: string | null;
  samplePhotoLocalUri: string | null;
  samplePhotoUrl: string | null;
  samplePhotoMetadataJson: string | null;
  sampleSavedAt: string | null;
  sampleCompleted: boolean;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  submissionStatus: string;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PyrolysisBatchRowRaw {
  id: string;
  session_id: string;
  server_id: string | null;
  kontikki_id: string;
  kontikki_code: string;
  producer_name: string | null;
  batch_number: string | null;
  feedstock_quantity: number | null;
  avg_feedstock_size_cm: number | null;
  feedstock_id: string | null;
  feedstock_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  feedstock_photo_local_uri: string | null;
  feedstock_photo_url: string | null;
  feedstock_size_photo_local_uri: string | null;
  feedstock_size_photo_url: string | null;
  feedstock_photo_metadata_json: string | null;
  feedstock_size_photo_metadata_json: string | null;
  moisture_reading_1: number | null;
  moisture_reading_2: number | null;
  moisture_reading_3: number | null;
  moisture_reading_4: number | null;
  moisture_reading_5: number | null;
  moisture_photo_local_uri_1: string | null;
  moisture_photo_local_uri_2: string | null;
  moisture_photo_local_uri_3: string | null;
  moisture_photo_local_uri_4: string | null;
  moisture_photo_local_uri_5: string | null;
  moisture_photo_url_1: string | null;
  moisture_photo_url_2: string | null;
  moisture_photo_url_3: string | null;
  moisture_photo_url_4: string | null;
  moisture_photo_url_5: string | null;
  moisture_photo_metadata_json_1: string | null;
  moisture_photo_metadata_json_2: string | null;
  moisture_photo_metadata_json_3: string | null;
  moisture_photo_metadata_json_4: string | null;
  moisture_photo_metadata_json_5: string | null;
  stage_initial_photo_local_uri: string | null;
  stage_middle_photo_local_uri: string | null;
  stage_final_photo_local_uri: string | null;
  stage_quenching_photo_local_uri: string | null;
  stage_initial_photo_url: string | null;
  stage_middle_photo_url: string | null;
  stage_final_photo_url: string | null;
  stage_quenching_photo_url: string | null;
  stage_initial_captured_at: string | null;
  stage_middle_captured_at: string | null;
  stage_final_captured_at: string | null;
  stage_quenching_captured_at: string | null;
  stage_initial_saved_at: string | null;
  stage_middle_saved_at: string | null;
  stage_final_saved_at: string | null;
  stage_quenching_saved_at: string | null;
  stage_initial_photo_metadata_json: string | null;
  stage_middle_photo_metadata_json: string | null;
  stage_final_photo_metadata_json: string | null;
  stage_quenching_photo_metadata_json: string | null;
  info_completed: number;
  moisture_completed: number;
  pyrolysis_completed: number;
  info_saved_at: string | null;
  moisture_saved_at: string | null;
  pyrolysis_saved_at: string | null;
  yield_saved_at: string | null;
  yield_percent: number | null;
  comment: string | null;
  sample_id: string | null;
  sample_photo_local_uri: string | null;
  sample_photo_url: string | null;
  sample_photo_metadata_json: string | null;
  sample_saved_at: string | null;
  sample_completed: number;
  review_status: string | null;
  reviewer_notes: string | null;
  submission_status: string;
  sync_status: string;
  sync_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToPyrolysisBatch(row: PyrolysisBatchRowRaw): PyrolysisBatch {
  return {
    id: row.id,
    sessionId: row.session_id,
    serverId: row.server_id,
    kontikkiId: row.kontikki_id,
    kontikkiCode: row.kontikki_code,
    producerName: row.producer_name,
    batchNumber: row.batch_number,
    feedstockQuantity: row.feedstock_quantity,
    avgFeedstockSizeCm: row.avg_feedstock_size_cm,
    feedstockId: row.feedstock_id,
    feedstockName: row.feedstock_name,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    locationAddress: row.location_address,
    feedstockPhotoLocalUri: row.feedstock_photo_local_uri,
    feedstockPhotoUrl: row.feedstock_photo_url,
    feedstockSizePhotoLocalUri: row.feedstock_size_photo_local_uri,
    feedstockSizePhotoUrl: row.feedstock_size_photo_url,
    feedstockPhotoMetadataJson: row.feedstock_photo_metadata_json,
    feedstockSizePhotoMetadataJson: row.feedstock_size_photo_metadata_json,
    moistureReading1: row.moisture_reading_1,
    moistureReading2: row.moisture_reading_2,
    moistureReading3: row.moisture_reading_3,
    moistureReading4: row.moisture_reading_4,
    moistureReading5: row.moisture_reading_5,
    moisturePhotoLocalUri1: row.moisture_photo_local_uri_1,
    moisturePhotoLocalUri2: row.moisture_photo_local_uri_2,
    moisturePhotoLocalUri3: row.moisture_photo_local_uri_3,
    moisturePhotoLocalUri4: row.moisture_photo_local_uri_4,
    moisturePhotoLocalUri5: row.moisture_photo_local_uri_5,
    moisturePhotoUrl1: row.moisture_photo_url_1,
    moisturePhotoUrl2: row.moisture_photo_url_2,
    moisturePhotoUrl3: row.moisture_photo_url_3,
    moisturePhotoUrl4: row.moisture_photo_url_4,
    moisturePhotoUrl5: row.moisture_photo_url_5,
    moisturePhotoMetadataJson1: row.moisture_photo_metadata_json_1,
    moisturePhotoMetadataJson2: row.moisture_photo_metadata_json_2,
    moisturePhotoMetadataJson3: row.moisture_photo_metadata_json_3,
    moisturePhotoMetadataJson4: row.moisture_photo_metadata_json_4,
    moisturePhotoMetadataJson5: row.moisture_photo_metadata_json_5,
    stageInitialPhotoLocalUri: row.stage_initial_photo_local_uri,
    stageMiddlePhotoLocalUri: row.stage_middle_photo_local_uri,
    stageFinalPhotoLocalUri: row.stage_final_photo_local_uri,
    stageQuenchingPhotoLocalUri: row.stage_quenching_photo_local_uri,
    stageInitialPhotoUrl: row.stage_initial_photo_url,
    stageMiddlePhotoUrl: row.stage_middle_photo_url,
    stageFinalPhotoUrl: row.stage_final_photo_url,
    stageQuenchingPhotoUrl: row.stage_quenching_photo_url,
    stageInitialCapturedAt: row.stage_initial_captured_at,
    stageMiddleCapturedAt: row.stage_middle_captured_at,
    stageFinalCapturedAt: row.stage_final_captured_at,
    stageQuenchingCapturedAt: row.stage_quenching_captured_at,
    stageInitialSavedAt: row.stage_initial_saved_at,
    stageMiddleSavedAt: row.stage_middle_saved_at,
    stageFinalSavedAt: row.stage_final_saved_at,
    stageQuenchingSavedAt: row.stage_quenching_saved_at,
    stageInitialPhotoMetadataJson: row.stage_initial_photo_metadata_json,
    stageMiddlePhotoMetadataJson: row.stage_middle_photo_metadata_json,
    stageFinalPhotoMetadataJson: row.stage_final_photo_metadata_json,
    stageQuenchingPhotoMetadataJson: row.stage_quenching_photo_metadata_json,
    infoCompleted: fromSqliteBool(row.info_completed),
    moistureCompleted: fromSqliteBool(row.moisture_completed),
    pyrolysisCompleted: fromSqliteBool(row.pyrolysis_completed),
    infoSavedAt: row.info_saved_at,
    moistureSavedAt: row.moisture_saved_at,
    pyrolysisSavedAt: row.pyrolysis_saved_at,
    yieldSavedAt: row.yield_saved_at,
    yieldPercent: row.yield_percent,
    comment: row.comment,
    sampleId: row.sample_id,
    samplePhotoLocalUri: row.sample_photo_local_uri,
    samplePhotoUrl: row.sample_photo_url,
    samplePhotoMetadataJson: row.sample_photo_metadata_json,
    sampleSavedAt: row.sample_saved_at,
    sampleCompleted: fromSqliteBool(row.sample_completed),
    reviewStatus: row.review_status,
    reviewerNotes: row.reviewer_notes,
    submissionStatus: row.submission_status ?? "draft",
    uploadStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function pyrolysisBatchToRow(
  batch: Omit<PyrolysisBatch, "id">,
): Record<string, unknown> {
  return {
    session_id: batch.sessionId,
    server_id: batch.serverId,
    kontikki_id: batch.kontikkiId,
    kontikki_code: batch.kontikkiCode,
    producer_name: batch.producerName,
    batch_number: batch.batchNumber,
    feedstock_quantity: batch.feedstockQuantity,
    avg_feedstock_size_cm: batch.avgFeedstockSizeCm,
    feedstock_id: batch.feedstockId,
    feedstock_name: batch.feedstockName,
    location_lat: batch.locationLat,
    location_lng: batch.locationLng,
    location_address: batch.locationAddress,
    feedstock_photo_local_uri: batch.feedstockPhotoLocalUri,
    feedstock_photo_url: batch.feedstockPhotoUrl,
    feedstock_size_photo_local_uri: batch.feedstockSizePhotoLocalUri,
    feedstock_size_photo_url: batch.feedstockSizePhotoUrl,
    feedstock_photo_metadata_json: batch.feedstockPhotoMetadataJson,
    feedstock_size_photo_metadata_json: batch.feedstockSizePhotoMetadataJson,
    moisture_reading_1: batch.moistureReading1,
    moisture_reading_2: batch.moistureReading2,
    moisture_reading_3: batch.moistureReading3,
    moisture_reading_4: batch.moistureReading4,
    moisture_reading_5: batch.moistureReading5,
    moisture_photo_local_uri_1: batch.moisturePhotoLocalUri1,
    moisture_photo_local_uri_2: batch.moisturePhotoLocalUri2,
    moisture_photo_local_uri_3: batch.moisturePhotoLocalUri3,
    moisture_photo_local_uri_4: batch.moisturePhotoLocalUri4,
    moisture_photo_local_uri_5: batch.moisturePhotoLocalUri5,
    moisture_photo_url_1: batch.moisturePhotoUrl1,
    moisture_photo_url_2: batch.moisturePhotoUrl2,
    moisture_photo_url_3: batch.moisturePhotoUrl3,
    moisture_photo_url_4: batch.moisturePhotoUrl4,
    moisture_photo_url_5: batch.moisturePhotoUrl5,
    moisture_photo_metadata_json_1: batch.moisturePhotoMetadataJson1,
    moisture_photo_metadata_json_2: batch.moisturePhotoMetadataJson2,
    moisture_photo_metadata_json_3: batch.moisturePhotoMetadataJson3,
    moisture_photo_metadata_json_4: batch.moisturePhotoMetadataJson4,
    moisture_photo_metadata_json_5: batch.moisturePhotoMetadataJson5,
    stage_initial_photo_local_uri: batch.stageInitialPhotoLocalUri,
    stage_middle_photo_local_uri: batch.stageMiddlePhotoLocalUri,
    stage_final_photo_local_uri: batch.stageFinalPhotoLocalUri,
    stage_quenching_photo_local_uri: batch.stageQuenchingPhotoLocalUri,
    stage_initial_photo_url: batch.stageInitialPhotoUrl,
    stage_middle_photo_url: batch.stageMiddlePhotoUrl,
    stage_final_photo_url: batch.stageFinalPhotoUrl,
    stage_quenching_photo_url: batch.stageQuenchingPhotoUrl,
    stage_initial_captured_at: batch.stageInitialCapturedAt,
    stage_middle_captured_at: batch.stageMiddleCapturedAt,
    stage_final_captured_at: batch.stageFinalCapturedAt,
    stage_quenching_captured_at: batch.stageQuenchingCapturedAt,
    stage_initial_saved_at: batch.stageInitialSavedAt,
    stage_middle_saved_at: batch.stageMiddleSavedAt,
    stage_final_saved_at: batch.stageFinalSavedAt,
    stage_quenching_saved_at: batch.stageQuenchingSavedAt,
    stage_initial_photo_metadata_json: batch.stageInitialPhotoMetadataJson,
    stage_middle_photo_metadata_json: batch.stageMiddlePhotoMetadataJson,
    stage_final_photo_metadata_json: batch.stageFinalPhotoMetadataJson,
    stage_quenching_photo_metadata_json: batch.stageQuenchingPhotoMetadataJson,
    info_completed: toSqliteBool(batch.infoCompleted),
    moisture_completed: toSqliteBool(batch.moistureCompleted),
    pyrolysis_completed: toSqliteBool(batch.pyrolysisCompleted),
    info_saved_at: batch.infoSavedAt,
    moisture_saved_at: batch.moistureSavedAt,
    pyrolysis_saved_at: batch.pyrolysisSavedAt,
    yield_saved_at: batch.yieldSavedAt,
    yield_percent: batch.yieldPercent,
    comment: batch.comment,
    sample_id: batch.sampleId,
    sample_photo_local_uri: batch.samplePhotoLocalUri,
    sample_photo_url: batch.samplePhotoUrl,
    sample_photo_metadata_json: batch.samplePhotoMetadataJson,
    sample_saved_at: batch.sampleSavedAt,
    sample_completed: toSqliteBool(batch.sampleCompleted),
    review_status: batch.reviewStatus,
    reviewer_notes: batch.reviewerNotes,
    submission_status: batch.submissionStatus,
    sync_status: batch.uploadStatus,
    sync_error: batch.syncError,
    created_at: batch.createdAt,
    updated_at: batch.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// mixing_entries
// ---------------------------------------------------------------------------

export interface MixingEntry {
  id: string;
  serverId: string | null;
  operatorId: string;
  startedAt: string;
  status: string;
  farmId: string | null;
  farmName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  materialType: string | null;
  materialToBiocharRatio: number | null;
  comment: string | null;
  biocharPhotoLocalUri: string | null;
  biocharPhotoUrl: string | null;
  biocharPhotoMetadataJson: string | null;
  substratePhotoLocalUri: string | null;
  substratePhotoUrl: string | null;
  substratePhotoMetadataJson: string | null;
  mixingPhotoLocalUri: string | null;
  mixingPhotoUrl: string | null;
  mixingPhotoMetadataJson: string | null;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface MixingEntryRowRaw {
  id: string;
  server_id: string | null;
  operator_id: string;
  started_at: string;
  status: string;
  farm_id: string | null;
  farm_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  material_type: string | null;
  material_to_biochar_ratio: number | null;
  comment: string | null;
  biochar_photo_local_uri: string | null;
  biochar_photo_url: string | null;
  biochar_photo_metadata_json: string | null;
  substrate_photo_local_uri: string | null;
  substrate_photo_url: string | null;
  substrate_photo_metadata_json: string | null;
  mixing_photo_local_uri: string | null;
  mixing_photo_url: string | null;
  mixing_photo_metadata_json: string | null;
  review_status: string | null;
  reviewer_notes: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToMixingEntry(row: MixingEntryRowRaw): MixingEntry {
  return {
    id: row.id,
    serverId: row.server_id,
    operatorId: row.operator_id,
    startedAt: row.started_at,
    status: row.status,
    farmId: row.farm_id,
    farmName: row.farm_name,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    locationAddress: row.location_address,
    materialType: row.material_type,
    materialToBiocharRatio: row.material_to_biochar_ratio,
    comment: row.comment,
    biocharPhotoLocalUri: row.biochar_photo_local_uri,
    biocharPhotoUrl: row.biochar_photo_url,
    biocharPhotoMetadataJson: row.biochar_photo_metadata_json,
    substratePhotoLocalUri: row.substrate_photo_local_uri,
    substratePhotoUrl: row.substrate_photo_url,
    substratePhotoMetadataJson: row.substrate_photo_metadata_json,
    mixingPhotoLocalUri: row.mixing_photo_local_uri,
    mixingPhotoUrl: row.mixing_photo_url,
    mixingPhotoMetadataJson: row.mixing_photo_metadata_json,
    reviewStatus: row.review_status,
    reviewerNotes: row.reviewer_notes,
    uploadStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mixingEntryToRow(entry: Omit<MixingEntry, "id">): Record<string, unknown> {
  return {
    server_id: entry.serverId,
    operator_id: entry.operatorId,
    started_at: entry.startedAt,
    status: entry.status,
    farm_id: entry.farmId,
    farm_name: entry.farmName,
    location_lat: entry.locationLat,
    location_lng: entry.locationLng,
    location_address: entry.locationAddress,
    material_type: entry.materialType,
    material_to_biochar_ratio: entry.materialToBiocharRatio,
    comment: entry.comment,
    biochar_photo_local_uri: entry.biocharPhotoLocalUri,
    biochar_photo_url: entry.biocharPhotoUrl,
    biochar_photo_metadata_json: entry.biocharPhotoMetadataJson,
    substrate_photo_local_uri: entry.substratePhotoLocalUri,
    substrate_photo_url: entry.substratePhotoUrl,
    substrate_photo_metadata_json: entry.substratePhotoMetadataJson,
    mixing_photo_local_uri: entry.mixingPhotoLocalUri,
    mixing_photo_url: entry.mixingPhotoUrl,
    mixing_photo_metadata_json: entry.mixingPhotoMetadataJson,
    review_status: entry.reviewStatus,
    reviewer_notes: entry.reviewerNotes,
    sync_status: entry.uploadStatus,
    sync_error: entry.syncError,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// mixing_pyrolysis_links
// ---------------------------------------------------------------------------

export interface MixingPyrolysisLink {
  id: string;
  mixingEntryId: string;
  pyrolysisBatchServerId: string;
  pyrolysisBatchLocalId: string | null;
  kontikkiCode: string | null;
  batchNumber: string | null;
  producerName: string | null;
}

interface MixingPyrolysisLinkRowRaw {
  id: string;
  mixing_entry_id: string;
  pyrolysis_batch_server_id: string;
  pyrolysis_batch_local_id: string | null;
  kontikki_code: string | null;
  batch_number: string | null;
  producer_name: string | null;
}

export function rowToMixingPyrolysisLink(row: MixingPyrolysisLinkRowRaw): MixingPyrolysisLink {
  return {
    id: row.id,
    mixingEntryId: row.mixing_entry_id,
    pyrolysisBatchServerId: row.pyrolysis_batch_server_id,
    pyrolysisBatchLocalId: row.pyrolysis_batch_local_id,
    kontikkiCode: row.kontikki_code,
    batchNumber: row.batch_number,
    producerName: row.producer_name,
  };
}

export function mixingPyrolysisLinkToRow(
  link: Omit<MixingPyrolysisLink, "id">,
): Record<string, unknown> {
  return {
    mixing_entry_id: link.mixingEntryId,
    pyrolysis_batch_server_id: link.pyrolysisBatchServerId,
    pyrolysis_batch_local_id: link.pyrolysisBatchLocalId,
    kontikki_code: link.kontikkiCode,
    batch_number: link.batchNumber,
    producer_name: link.producerName,
  };
}

// ---------------------------------------------------------------------------
// application_entries
// ---------------------------------------------------------------------------

export interface ApplicationEntry {
  id: string;
  serverId: string | null;
  operatorId: string;
  appliedAt: string;
  status: string;
  farmId: string | null;
  farmName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  comment: string | null;
  mediaType: string | null;
  mediaLocalUri: string | null;
  mediaUrl: string | null;
  mediaMetadataJson: string | null;
  reviewStatus: string | null;
  reviewerNotes: string | null;
  uploadStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ApplicationEntryRowRaw {
  id: string;
  server_id: string | null;
  operator_id: string;
  applied_at: string;
  status: string;
  farm_id: string | null;
  farm_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  comment: string | null;
  media_type: string | null;
  media_local_uri: string | null;
  media_url: string | null;
  media_metadata_json: string | null;
  review_status: string | null;
  reviewer_notes: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: number;
  updated_at: number;
}

export function rowToApplicationEntry(row: ApplicationEntryRowRaw): ApplicationEntry {
  return {
    id: row.id,
    serverId: row.server_id,
    operatorId: row.operator_id,
    appliedAt: row.applied_at,
    status: row.status,
    farmId: row.farm_id,
    farmName: row.farm_name,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    locationAddress: row.location_address,
    comment: row.comment,
    mediaType: row.media_type,
    mediaLocalUri: row.media_local_uri,
    mediaUrl: row.media_url,
    mediaMetadataJson: row.media_metadata_json,
    reviewStatus: row.review_status,
    reviewerNotes: row.reviewer_notes,
    uploadStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function applicationEntryToRow(
  entry: Omit<ApplicationEntry, "id">,
): Record<string, unknown> {
  return {
    server_id: entry.serverId,
    operator_id: entry.operatorId,
    applied_at: entry.appliedAt,
    status: entry.status,
    farm_id: entry.farmId,
    farm_name: entry.farmName,
    location_lat: entry.locationLat,
    location_lng: entry.locationLng,
    location_address: entry.locationAddress,
    comment: entry.comment,
    media_type: entry.mediaType,
    media_local_uri: entry.mediaLocalUri,
    media_url: entry.mediaUrl,
    media_metadata_json: entry.mediaMetadataJson,
    review_status: entry.reviewStatus,
    reviewer_notes: entry.reviewerNotes,
    sync_status: entry.uploadStatus,
    sync_error: entry.syncError,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// application_pyrolysis_links
// ---------------------------------------------------------------------------

export interface ApplicationPyrolysisLink {
  id: string;
  applicationEntryId: string;
  pyrolysisBatchServerId: string;
  pyrolysisBatchLocalId: string | null;
  kontikkiCode: string | null;
  batchNumber: string | null;
  producerName: string | null;
}

interface ApplicationPyrolysisLinkRowRaw {
  id: string;
  application_entry_id: string;
  pyrolysis_batch_server_id: string;
  pyrolysis_batch_local_id: string | null;
  kontikki_code: string | null;
  batch_number: string | null;
  producer_name: string | null;
}

export function rowToApplicationPyrolysisLink(
  row: ApplicationPyrolysisLinkRowRaw,
): ApplicationPyrolysisLink {
  return {
    id: row.id,
    applicationEntryId: row.application_entry_id,
    pyrolysisBatchServerId: row.pyrolysis_batch_server_id,
    pyrolysisBatchLocalId: row.pyrolysis_batch_local_id,
    kontikkiCode: row.kontikki_code,
    batchNumber: row.batch_number,
    producerName: row.producer_name,
  };
}

export function applicationPyrolysisLinkToRow(
  link: Omit<ApplicationPyrolysisLink, "id">,
): Record<string, unknown> {
  return {
    application_entry_id: link.applicationEntryId,
    pyrolysis_batch_server_id: link.pyrolysisBatchServerId,
    pyrolysis_batch_local_id: link.pyrolysisBatchLocalId,
    kontikki_code: link.kontikkiCode,
    batch_number: link.batchNumber,
    producer_name: link.producerName,
  };
}

// ---------------------------------------------------------------------------
// encrypted_batches
// ---------------------------------------------------------------------------

export interface EncryptedBatch {
  id: string;
  kilnId: string;
  kontikkiId: string;
  payloadBase64: string;
  sourceFilename: string;
  isSynced: boolean;
  createdAt: Date;
}

interface EncryptedBatchRowRaw {
  id: string;
  kiln_id: string;
  kontikki_id: string | null;
  payload_base64: string;
  source_filename: string;
  is_synced: number;
  created_at: number;
}

export function rowToEncryptedBatch(row: EncryptedBatchRowRaw): EncryptedBatch {
  return {
    id: row.id,
    kilnId: row.kiln_id,
    kontikkiId: row.kontikki_id ?? "",
    payloadBase64: row.payload_base64,
    sourceFilename: row.source_filename,
    isSynced: fromSqliteBool(row.is_synced),
    createdAt: new Date(row.created_at),
  };
}

export function encryptedBatchToRow(
  batch: Omit<EncryptedBatch, "id" | "createdAt"> & { createdAt?: number },
): Record<string, unknown> {
  return {
    kiln_id: batch.kilnId,
    kontikki_id: batch.kontikkiId,
    payload_base64: batch.payloadBase64,
    source_filename: batch.sourceFilename,
    is_synced: toSqliteBool(batch.isSynced),
    created_at: batch.createdAt ?? Date.now(),
  };
}
