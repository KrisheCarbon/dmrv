import {
  PYROLYSIS_STAGE_KEYS,
  flatRowToKontikkiData,
  kontikkiDataToFlatRow,
  moisturePhotoLocalUriKey,
  moisturePhotoMetadataKey,
  moisturePhotoUrlKey,
  moistureReadingKey,
  stageCapturedAtKey,
  stagePhotoLocalUriKey,
  stagePhotoMetadataKey,
  stagePhotoUrlKey,
  stageSavedAtKey,
  type FieldPhotoMetadata,
  type PyrolysisBatchLocalRow,
  type PyrolysisBatchRecord,
  type PyrolysisKontikkiData,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildUpdate } from "../database/sqlHelpers";
import { pyrolysisBatchToRow, rowToPyrolysisBatch, type PyrolysisBatch } from "../database/types";

function batchesTable() {
  return "pyrolysis_batches";
}

async function findBatchOrThrow(batchId: string): Promise<PyrolysisBatch> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM ${batchesTable()} WHERE id = ?`,
    [batchId],
  );
  if (!row) {
    throw new Error(`Pyrolysis batch with id ${batchId} not found`);
  }
  return rowToPyrolysisBatch(row);
}

function parseMetadata(json: string | null | undefined): FieldPhotoMetadata | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as FieldPhotoMetadata;
  } catch {
    return null;
  }
}

function stringifyMetadata(value: FieldPhotoMetadata | null | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

function batchToLocalRow(batch: PyrolysisBatch): PyrolysisBatchLocalRow {
  const row: PyrolysisBatchLocalRow = {
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
    feedstock_photo_metadata: parseMetadata(batch.feedstockPhotoMetadataJson),
    feedstock_size_photo_metadata: parseMetadata(batch.feedstockSizePhotoMetadataJson),
    yield_percent: batch.yieldPercent,
    comment: batch.comment,
    sample_id: batch.sampleId,
    sample_photo_local_uri: batch.samplePhotoLocalUri,
    sample_photo_url: batch.samplePhotoUrl,
    sample_photo_metadata: parseMetadata(batch.samplePhotoMetadataJson),
    sample_saved_at: batch.sampleSavedAt,
    info_saved_at: batch.infoSavedAt,
    moisture_saved_at: batch.moistureSavedAt,
    pyrolysis_saved_at: batch.pyrolysisSavedAt,
    yield_saved_at: batch.yieldSavedAt,
  };

  for (let i = 1; i <= 5; i += 1) {
    const slot = i as 1 | 2 | 3 | 4 | 5;
    const moistureReadings = [
      batch.moistureReading1,
      batch.moistureReading2,
      batch.moistureReading3,
      batch.moistureReading4,
      batch.moistureReading5,
    ];
    const moistureLocalUris = [
      batch.moisturePhotoLocalUri1,
      batch.moisturePhotoLocalUri2,
      batch.moisturePhotoLocalUri3,
      batch.moisturePhotoLocalUri4,
      batch.moisturePhotoLocalUri5,
    ];
    const moistureUrls = [
      batch.moisturePhotoUrl1,
      batch.moisturePhotoUrl2,
      batch.moisturePhotoUrl3,
      batch.moisturePhotoUrl4,
      batch.moisturePhotoUrl5,
    ];
    const moistureMetadata = [
      batch.moisturePhotoMetadataJson1,
      batch.moisturePhotoMetadataJson2,
      batch.moisturePhotoMetadataJson3,
      batch.moisturePhotoMetadataJson4,
      batch.moisturePhotoMetadataJson5,
    ];
    row[moistureReadingKey(slot)] = moistureReadings[i - 1] ?? null;
    row[moisturePhotoLocalUriKey(slot)] = moistureLocalUris[i - 1] ?? null;
    row[moisturePhotoUrlKey(slot)] = moistureUrls[i - 1] ?? null;
    row[moisturePhotoMetadataKey(slot)] = parseMetadata(moistureMetadata[i - 1]);
  }

  const stageLocalUris: Record<string, string | null> = {
    initial: batch.stageInitialPhotoLocalUri,
    middle: batch.stageMiddlePhotoLocalUri,
    final: batch.stageFinalPhotoLocalUri,
    quenching: batch.stageQuenchingPhotoLocalUri,
  };
  const stageUrls: Record<string, string | null> = {
    initial: batch.stageInitialPhotoUrl,
    middle: batch.stageMiddlePhotoUrl,
    final: batch.stageFinalPhotoUrl,
    quenching: batch.stageQuenchingPhotoUrl,
  };
  const stageCaptured: Record<string, string | null> = {
    initial: batch.stageInitialCapturedAt,
    middle: batch.stageMiddleCapturedAt,
    final: batch.stageFinalCapturedAt,
    quenching: batch.stageQuenchingCapturedAt,
  };
  const stageSaved: Record<string, string | null> = {
    initial: batch.stageInitialSavedAt,
    middle: batch.stageMiddleSavedAt,
    final: batch.stageFinalSavedAt,
    quenching: batch.stageQuenchingSavedAt,
  };
  const stageMetadata: Record<string, string | null> = {
    initial: batch.stageInitialPhotoMetadataJson,
    middle: batch.stageMiddlePhotoMetadataJson,
    final: batch.stageFinalPhotoMetadataJson,
    quenching: batch.stageQuenchingPhotoMetadataJson,
  };

  for (const stage of PYROLYSIS_STAGE_KEYS) {
    row[stagePhotoLocalUriKey(stage)] = stageLocalUris[stage] ?? null;
    row[stagePhotoUrlKey(stage)] = stageUrls[stage] ?? null;
    row[stageCapturedAtKey(stage)] = stageCaptured[stage] ?? null;
    row[stageSavedAtKey(stage)] = stageSaved[stage] ?? null;
    row[stagePhotoMetadataKey(stage)] = parseMetadata(stageMetadata[stage]);
  }

  return row;
}

/** Returns the subset of PyrolysisBatch fields that `row` maps onto. */
function localRowToBatchPatch(row: PyrolysisBatchLocalRow): Partial<PyrolysisBatch> {
  const patch: Partial<PyrolysisBatch> = {
    batchNumber: row.batch_number ?? null,
    feedstockQuantity: row.feedstock_quantity ?? null,
    avgFeedstockSizeCm: row.avg_feedstock_size_cm ?? null,
    feedstockId: row.feedstock_id ?? null,
    feedstockName: row.feedstock_name ?? null,
    locationLat: row.location_lat ?? null,
    locationLng: row.location_lng ?? null,
    locationAddress: row.location_address ?? null,
    feedstockPhotoLocalUri: row.feedstock_photo_local_uri ?? null,
    feedstockPhotoUrl: row.feedstock_photo_url ?? null,
    feedstockSizePhotoLocalUri: row.feedstock_size_photo_local_uri ?? null,
    feedstockSizePhotoUrl: row.feedstock_size_photo_url ?? null,
    feedstockPhotoMetadataJson: stringifyMetadata(row.feedstock_photo_metadata),
    feedstockSizePhotoMetadataJson: stringifyMetadata(row.feedstock_size_photo_metadata),
    yieldPercent: row.yield_percent ?? null,
    comment: row.comment ?? null,
    sampleId: row.sample_id ?? null,
    samplePhotoLocalUri: row.sample_photo_local_uri ?? null,
    samplePhotoUrl: row.sample_photo_url ?? null,
    samplePhotoMetadataJson: stringifyMetadata(row.sample_photo_metadata),
    sampleSavedAt: row.sample_saved_at ?? null,
    infoSavedAt: row.info_saved_at ?? null,
    moistureSavedAt: row.moisture_saved_at ?? null,
    pyrolysisSavedAt: row.pyrolysis_saved_at ?? null,
    yieldSavedAt: row.yield_saved_at ?? null,
  };

  for (let i = 1; i <= 5; i += 1) {
    const slot = i as 1 | 2 | 3 | 4 | 5;
    const reading = row[moistureReadingKey(slot)] ?? null;
    const localUri = row[moisturePhotoLocalUriKey(slot)] ?? null;
    const url = row[moisturePhotoUrlKey(slot)] ?? null;
    const metadata = stringifyMetadata(row[moisturePhotoMetadataKey(slot)]);

    if (i === 1) {
      patch.moistureReading1 = reading;
      patch.moisturePhotoLocalUri1 = localUri;
      patch.moisturePhotoUrl1 = url;
      patch.moisturePhotoMetadataJson1 = metadata;
    } else if (i === 2) {
      patch.moistureReading2 = reading;
      patch.moisturePhotoLocalUri2 = localUri;
      patch.moisturePhotoUrl2 = url;
      patch.moisturePhotoMetadataJson2 = metadata;
    } else if (i === 3) {
      patch.moistureReading3 = reading;
      patch.moisturePhotoLocalUri3 = localUri;
      patch.moisturePhotoUrl3 = url;
      patch.moisturePhotoMetadataJson3 = metadata;
    } else if (i === 4) {
      patch.moistureReading4 = reading;
      patch.moisturePhotoLocalUri4 = localUri;
      patch.moisturePhotoUrl4 = url;
      patch.moisturePhotoMetadataJson4 = metadata;
    } else {
      patch.moistureReading5 = reading;
      patch.moisturePhotoLocalUri5 = localUri;
      patch.moisturePhotoUrl5 = url;
      patch.moisturePhotoMetadataJson5 = metadata;
    }
  }

  patch.stageInitialPhotoLocalUri = row.stage_initial_photo_local_uri ?? null;
  patch.stageMiddlePhotoLocalUri = row.stage_middle_photo_local_uri ?? null;
  patch.stageFinalPhotoLocalUri = row.stage_final_photo_local_uri ?? null;
  patch.stageQuenchingPhotoLocalUri = row.stage_quenching_photo_local_uri ?? null;
  patch.stageInitialPhotoUrl = row.stage_initial_photo_url ?? null;
  patch.stageMiddlePhotoUrl = row.stage_middle_photo_url ?? null;
  patch.stageFinalPhotoUrl = row.stage_final_photo_url ?? null;
  patch.stageQuenchingPhotoUrl = row.stage_quenching_photo_url ?? null;
  patch.stageInitialCapturedAt = row.stage_initial_captured_at ?? null;
  patch.stageMiddleCapturedAt = row.stage_middle_captured_at ?? null;
  patch.stageFinalCapturedAt = row.stage_final_captured_at ?? null;
  patch.stageQuenchingCapturedAt = row.stage_quenching_captured_at ?? null;
  patch.stageInitialSavedAt = row.stage_initial_saved_at ?? null;
  patch.stageMiddleSavedAt = row.stage_middle_saved_at ?? null;
  patch.stageFinalSavedAt = row.stage_final_saved_at ?? null;
  patch.stageQuenchingSavedAt = row.stage_quenching_saved_at ?? null;
  patch.stageInitialPhotoMetadataJson = stringifyMetadata(row.stage_initial_photo_metadata);
  patch.stageMiddlePhotoMetadataJson = stringifyMetadata(row.stage_middle_photo_metadata);
  patch.stageFinalPhotoMetadataJson = stringifyMetadata(row.stage_final_photo_metadata);
  patch.stageQuenchingPhotoMetadataJson = stringifyMetadata(row.stage_quenching_photo_metadata);

  return patch;
}

function mergeKontikkiPayload(
  current: PyrolysisKontikkiData,
  patch: Partial<PyrolysisKontikkiData>,
): PyrolysisKontikkiData {
  const stage_photos = { ...current.stage_photos };
  if (patch.stage_photos) {
    for (const stage of PYROLYSIS_STAGE_KEYS) {
      const photo = patch.stage_photos[stage];
      if (!photo) continue;
      stage_photos[stage] = { ...stage_photos[stage], ...photo };
    }
  }

  const stage_saved_at = { ...current.stage_saved_at, ...patch.stage_saved_at };

  let moisture_readings = current.moisture_readings;
  if (patch.moisture_readings) {
    moisture_readings = (current.moisture_readings ?? []).map((reading, index) => ({
      ...reading,
      ...patch.moisture_readings?.[index],
    }));
  }

  return {
    ...current,
    ...patch,
    location: patch.location !== undefined ? patch.location : current.location,
    moisture_readings,
    stage_photos,
    stage_saved_at,
  };
}

export async function assembleBatchPayload(batchId: string): Promise<PyrolysisKontikkiData> {
  const batch = await findBatchOrThrow(batchId);
  return flatRowToKontikkiData(batchToLocalRow(batch));
}

export async function applyBatchPayload(
  batchId: string,
  payload: Partial<PyrolysisKontikkiData>,
): Promise<void> {
  const db = await getDb();
  const batch = await findBatchOrThrow(batchId);
  const current = flatRowToKontikkiData(batchToLocalRow(batch));
  const merged = mergeKontikkiPayload(current, payload);
  const flat = kontikkiDataToFlatRow(merged);

  const patch = localRowToBatchPatch(flat);
  const fullPatch: Partial<PyrolysisBatch> = { ...patch, updatedAt: Date.now() };
  const row = pyrolysisBatchToRow({ ...batch, ...fullPatch } as Omit<PyrolysisBatch, "id">);

  const { sql, args } = buildUpdate("pyrolysis_batches", row, "id = ?", [batchId]);
  await db.runAsync(sql, args);
}

export function batchToApiRecord(
  batch: PyrolysisBatch,
  payload: PyrolysisKontikkiData,
): PyrolysisBatchRecord {
  const flat = kontikkiDataToFlatRow(payload);

  return {
    id: batch.serverId ?? batch.id,
    session_id: batch.sessionId,
    kontikki_id: batch.kontikkiId,
    kontikki_code: batch.kontikkiCode,
    submission_status: batch.submissionStatus as PyrolysisBatchRecord["submission_status"],
    info_completed: batch.infoCompleted,
    moisture_completed: batch.moistureCompleted,
    pyrolysis_completed: batch.pyrolysisCompleted,
    batch_number: flat.batch_number ?? null,
    feedstock_quantity: flat.feedstock_quantity ?? null,
    avg_feedstock_size_cm: flat.avg_feedstock_size_cm ?? null,
    feedstock_id: flat.feedstock_id ?? null,
    feedstock_name: flat.feedstock_name ?? null,
    location_lat: flat.location_lat ?? null,
    location_lng: flat.location_lng ?? null,
    location_address: flat.location_address ?? null,
    feedstock_photo_url: flat.feedstock_photo_url ?? null,
    feedstock_size_photo_url: flat.feedstock_size_photo_url ?? null,
    feedstock_photo_metadata: flat.feedstock_photo_metadata ?? null,
    feedstock_size_photo_metadata: flat.feedstock_size_photo_metadata ?? null,
    moisture_reading_1: flat.moisture_reading_1 ?? null,
    moisture_reading_2: flat.moisture_reading_2 ?? null,
    moisture_reading_3: flat.moisture_reading_3 ?? null,
    moisture_reading_4: flat.moisture_reading_4 ?? null,
    moisture_reading_5: flat.moisture_reading_5 ?? null,
    moisture_photo_url_1: flat.moisture_photo_url_1 ?? null,
    moisture_photo_url_2: flat.moisture_photo_url_2 ?? null,
    moisture_photo_url_3: flat.moisture_photo_url_3 ?? null,
    moisture_photo_url_4: flat.moisture_photo_url_4 ?? null,
    moisture_photo_url_5: flat.moisture_photo_url_5 ?? null,
    moisture_photo_metadata_1: flat.moisture_photo_metadata_1 ?? null,
    moisture_photo_metadata_2: flat.moisture_photo_metadata_2 ?? null,
    moisture_photo_metadata_3: flat.moisture_photo_metadata_3 ?? null,
    moisture_photo_metadata_4: flat.moisture_photo_metadata_4 ?? null,
    moisture_photo_metadata_5: flat.moisture_photo_metadata_5 ?? null,
    stage_initial_photo_url: flat.stage_initial_photo_url ?? null,
    stage_middle_photo_url: flat.stage_middle_photo_url ?? null,
    stage_final_photo_url: flat.stage_final_photo_url ?? null,
    stage_quenching_photo_url: flat.stage_quenching_photo_url ?? null,
    stage_initial_captured_at: flat.stage_initial_captured_at ?? null,
    stage_middle_captured_at: flat.stage_middle_captured_at ?? null,
    stage_final_captured_at: flat.stage_final_captured_at ?? null,
    stage_quenching_captured_at: flat.stage_quenching_captured_at ?? null,
    stage_initial_saved_at: flat.stage_initial_saved_at ?? null,
    stage_middle_saved_at: flat.stage_middle_saved_at ?? null,
    stage_final_saved_at: flat.stage_final_saved_at ?? null,
    stage_quenching_saved_at: flat.stage_quenching_saved_at ?? null,
    stage_initial_photo_metadata: flat.stage_initial_photo_metadata ?? null,
    stage_middle_photo_metadata: flat.stage_middle_photo_metadata ?? null,
    stage_final_photo_metadata: flat.stage_final_photo_metadata ?? null,
    stage_quenching_photo_metadata: flat.stage_quenching_photo_metadata ?? null,
    yield_percent: flat.yield_percent ?? null,
    comment: flat.comment ?? null,
    sample_id: flat.sample_id ?? null,
    sample_photo_url: flat.sample_photo_url ?? null,
    sample_photo_metadata: flat.sample_photo_metadata ?? null,
    sample_saved_at: flat.sample_saved_at ?? null,
    info_saved_at: flat.info_saved_at ?? null,
    moisture_saved_at: flat.moisture_saved_at ?? null,
    pyrolysis_saved_at: flat.pyrolysis_saved_at ?? null,
    yield_saved_at: flat.yield_saved_at ?? null,
  };
}
