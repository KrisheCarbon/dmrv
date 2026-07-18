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
import { database } from "../database";
import PyrolysisBatch from "../database/models/PyrolysisBatch";

function batchesCollection() {
  return database.get<PyrolysisBatch>("pyrolysis_batches");
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
    farm_id: batch.farmId,
    farm_name: batch.farmName,
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

function applyLocalRowToBatch(record: PyrolysisBatch, row: PyrolysisBatchLocalRow): void {
  record.batchNumber = row.batch_number ?? null;
  record.feedstockQuantity = row.feedstock_quantity ?? null;
  record.farmId = row.farm_id ?? null;
  record.farmName = row.farm_name ?? null;
  record.avgFeedstockSizeCm = row.avg_feedstock_size_cm ?? null;
  record.feedstockId = row.feedstock_id ?? null;
  record.feedstockName = row.feedstock_name ?? null;
  record.locationLat = row.location_lat ?? null;
  record.locationLng = row.location_lng ?? null;
  record.locationAddress = row.location_address ?? null;
  record.feedstockPhotoLocalUri = row.feedstock_photo_local_uri ?? null;
  record.feedstockPhotoUrl = row.feedstock_photo_url ?? null;
  record.feedstockSizePhotoLocalUri = row.feedstock_size_photo_local_uri ?? null;
  record.feedstockSizePhotoUrl = row.feedstock_size_photo_url ?? null;
  record.feedstockPhotoMetadataJson = stringifyMetadata(row.feedstock_photo_metadata);
  record.feedstockSizePhotoMetadataJson = stringifyMetadata(row.feedstock_size_photo_metadata);
  record.yieldPercent = row.yield_percent ?? null;
  record.comment = row.comment ?? null;
  record.sampleId = row.sample_id ?? null;
  record.samplePhotoLocalUri = row.sample_photo_local_uri ?? null;
  record.samplePhotoUrl = row.sample_photo_url ?? null;
  record.samplePhotoMetadataJson = stringifyMetadata(row.sample_photo_metadata);
  record.sampleSavedAt = row.sample_saved_at ?? null;
  record.infoSavedAt = row.info_saved_at ?? null;
  record.moistureSavedAt = row.moisture_saved_at ?? null;
  record.pyrolysisSavedAt = row.pyrolysis_saved_at ?? null;
  record.yieldSavedAt = row.yield_saved_at ?? null;

  for (let i = 1; i <= 5; i += 1) {
    const slot = i as 1 | 2 | 3 | 4 | 5;
    const reading = row[moistureReadingKey(slot)] ?? null;
    const localUri = row[moisturePhotoLocalUriKey(slot)] ?? null;
    const url = row[moisturePhotoUrlKey(slot)] ?? null;
    const metadata = stringifyMetadata(row[moisturePhotoMetadataKey(slot)]);

    if (i === 1) {
      record.moistureReading1 = reading;
      record.moisturePhotoLocalUri1 = localUri;
      record.moisturePhotoUrl1 = url;
      record.moisturePhotoMetadataJson1 = metadata;
    } else if (i === 2) {
      record.moistureReading2 = reading;
      record.moisturePhotoLocalUri2 = localUri;
      record.moisturePhotoUrl2 = url;
      record.moisturePhotoMetadataJson2 = metadata;
    } else if (i === 3) {
      record.moistureReading3 = reading;
      record.moisturePhotoLocalUri3 = localUri;
      record.moisturePhotoUrl3 = url;
      record.moisturePhotoMetadataJson3 = metadata;
    } else if (i === 4) {
      record.moistureReading4 = reading;
      record.moisturePhotoLocalUri4 = localUri;
      record.moisturePhotoUrl4 = url;
      record.moisturePhotoMetadataJson4 = metadata;
    } else {
      record.moistureReading5 = reading;
      record.moisturePhotoLocalUri5 = localUri;
      record.moisturePhotoUrl5 = url;
      record.moisturePhotoMetadataJson5 = metadata;
    }
  }

  record.stageInitialPhotoLocalUri = row.stage_initial_photo_local_uri ?? null;
  record.stageMiddlePhotoLocalUri = row.stage_middle_photo_local_uri ?? null;
  record.stageFinalPhotoLocalUri = row.stage_final_photo_local_uri ?? null;
  record.stageQuenchingPhotoLocalUri = row.stage_quenching_photo_local_uri ?? null;
  record.stageInitialPhotoUrl = row.stage_initial_photo_url ?? null;
  record.stageMiddlePhotoUrl = row.stage_middle_photo_url ?? null;
  record.stageFinalPhotoUrl = row.stage_final_photo_url ?? null;
  record.stageQuenchingPhotoUrl = row.stage_quenching_photo_url ?? null;
  record.stageInitialCapturedAt = row.stage_initial_captured_at ?? null;
  record.stageMiddleCapturedAt = row.stage_middle_captured_at ?? null;
  record.stageFinalCapturedAt = row.stage_final_captured_at ?? null;
  record.stageQuenchingCapturedAt = row.stage_quenching_captured_at ?? null;
  record.stageInitialSavedAt = row.stage_initial_saved_at ?? null;
  record.stageMiddleSavedAt = row.stage_middle_saved_at ?? null;
  record.stageFinalSavedAt = row.stage_final_saved_at ?? null;
  record.stageQuenchingSavedAt = row.stage_quenching_saved_at ?? null;
  record.stageInitialPhotoMetadataJson = stringifyMetadata(row.stage_initial_photo_metadata);
  record.stageMiddlePhotoMetadataJson = stringifyMetadata(row.stage_middle_photo_metadata);
  record.stageFinalPhotoMetadataJson = stringifyMetadata(row.stage_final_photo_metadata);
  record.stageQuenchingPhotoMetadataJson = stringifyMetadata(row.stage_quenching_photo_metadata);
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
  const batch = await batchesCollection().find(batchId);
  return flatRowToKontikkiData(batchToLocalRow(batch));
}

export async function applyBatchPayload(
  batchId: string,
  payload: Partial<PyrolysisKontikkiData>,
): Promise<void> {
  await database.write(async () => {
    const batch = await batchesCollection().find(batchId);
    const current = flatRowToKontikkiData(batchToLocalRow(batch));
    const merged = mergeKontikkiPayload(current, payload);
    const flat = kontikkiDataToFlatRow(merged);

    await batch.update((record) => {
      applyLocalRowToBatch(record, flat);
      record.updatedAt = Date.now();
    });
  });
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
    info_completed: batch.infoCompleted,
    moisture_completed: batch.moistureCompleted,
    pyrolysis_completed: batch.pyrolysisCompleted,
    batch_number: flat.batch_number ?? null,
    feedstock_quantity: flat.feedstock_quantity ?? null,
    farm_id: flat.farm_id ?? null,
    farm_name: flat.farm_name ?? null,
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
