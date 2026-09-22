import {
  emptyRainbowMoistureReadings,
  isRainbowMoistureComplete,
  isRainbowProductionComplete,
  rainbowKontikkiWorkflowProgress,
  type FieldPhotoMetadata,
  type MoistureReading,
  type PyrolysisKontikkiData,
  type RainbowBiomassLoad,
  type RainbowPyrolysisBatchRecord,
  type PyrolysisKontikkiOption,
} from "@krishecarbon/shared";
import { getDb } from "../database/db";
import { buildInsert, buildUpdate, generateId } from "../database/sqlHelpers";
import {
  rainbowPyrolysisBatchToRow,
  rowToRainbowBiomassLoad,
  rowToRainbowMoisture,
  rowToRainbowPyrolysisBatch,
  type RainbowPyrolysisBatch,
} from "../database/types";
import {
  isInfoSectionComplete,
  isSampleSectionComplete,
  isYieldSectionComplete,
} from "../utils/pyrolysisSectionValidation";

const LOCAL_SYNC_STATUS = "local";

function parseMetadata(raw: string | null | undefined): FieldPhotoMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FieldPhotoMetadata;
  } catch {
    return null;
  }
}

function stringifyMetadata(value: FieldPhotoMetadata | null | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

export type RainbowDraft = {
  batch: RainbowPyrolysisBatch;
  moisture: MoistureReading[];
  biomassLoads: RainbowBiomassLoad[];
};

export async function insertRainbowBatchLocal(
  sessionId: string,
  kontikki: PyrolysisKontikkiOption,
  now: number,
  dbClient?: Awaited<ReturnType<typeof getDb>>,
): Promise<string> {
  const db = dbClient ?? (await getDb());
  const batchId = generateId();
  const row = rainbowPyrolysisBatchToRow({
    sessionId,
    serverId: null,
    kontikkiId: kontikki.id,
    kontikkiCode: kontikki.kontikki_code,
    producerId: kontikki.biochar_producer_id ?? null,
    producerName: kontikki.producer_name ?? null,
    batchNumber: null,
    feedstockQuantity: null,
    avgFeedstockSizeCm: null,
    feedstockId: null,
    feedstockName: null,
    locationLat: null,
    locationLng: null,
    locationAddress: null,
    feedstockPhotoLocalUri: null,
    feedstockPhotoUrl: null,
    feedstockSizePhotoLocalUri: null,
    feedstockSizePhotoUrl: null,
    feedstockPhotoMetadataJson: null,
    feedstockSizePhotoMetadataJson: null,
    infoCompleted: false,
    moistureCompleted: false,
    productionCompleted: false,
    yieldCompleted: false,
    sampleCompleted: false,
    infoSavedAt: null,
    moistureSavedAt: null,
    productionSavedAt: null,
    yieldSavedAt: null,
    yieldPercent: null,
    comment: null,
    sampleId: null,
    samplePhotoLocalUri: null,
    samplePhotoUrl: null,
    samplePhotoMetadataJson: null,
    sampleSavedAt: null,
    reviewStatus: null,
    reviewerNotes: null,
    submissionStatus: "draft",
    uploadStatus: LOCAL_SYNC_STATUS,
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });
  const insert = buildInsert("rainbow_pyrolysis_batches", { id: batchId, ...row });
  await db.runAsync(insert.sql, insert.args);

  for (let slot = 1; slot <= 10; slot += 1) {
    const moistureInsert = buildInsert("rainbow_pyrolysis_moisture", {
      id: generateId(),
      batch_id: batchId,
      slot,
      reading: null,
      photo_local_uri: null,
      photo_url: null,
      photo_metadata_json: null,
      created_at: now,
      updated_at: now,
    });
    await db.runAsync(moistureInsert.sql, moistureInsert.args);
  }

  const loadInsert = buildInsert("rainbow_pyrolysis_biomass_loads", {
    id: generateId(),
    batch_id: batchId,
    sequence: 1,
    photo_local_uri: null,
    photo_url: null,
    photo_metadata_json: null,
    captured_at: null,
    note: null,
    created_at: now,
    updated_at: now,
  });
  await db.runAsync(loadInsert.sql, loadInsert.args);

  return batchId;
}

export async function getRainbowBatch(batchId: string): Promise<RainbowPyrolysisBatch | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM rainbow_pyrolysis_batches WHERE id = ?",
    [batchId],
  );
  return row ? rowToRainbowPyrolysisBatch(row) : null;
}

export async function listRainbowBatchesForSession(
  sessionId: string,
): Promise<RainbowPyrolysisBatch[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM rainbow_pyrolysis_batches WHERE session_id = ? ORDER BY kontikki_code ASC",
    [sessionId],
  );
  return rows.map(rowToRainbowPyrolysisBatch);
}

export async function loadRainbowDraft(batchId: string): Promise<RainbowDraft> {
  const db = await getDb();
  const batchRow = await db.getFirstAsync<any>(
    "SELECT * FROM rainbow_pyrolysis_batches WHERE id = ?",
    [batchId],
  );
  if (!batchRow) {
    throw new Error(`Rainbow pyrolysis batch ${batchId} not found`);
  }
  const batch = rowToRainbowPyrolysisBatch(batchRow);

  const moistureRows = await db.getAllAsync<any>(
    "SELECT * FROM rainbow_pyrolysis_moisture WHERE batch_id = ? ORDER BY slot ASC",
    [batchId],
  );
  const moisture = emptyRainbowMoistureReadings().map((empty, index) => {
    const row = moistureRows.find((item) => item.slot === index + 1);
    if (!row) return empty;
    const mapped = rowToRainbowMoisture(row);
    return {
      reading: mapped.reading,
      photo_local_uri: mapped.photoLocalUri,
      photo_url: mapped.photoUrl,
      photo_metadata: parseMetadata(mapped.photoMetadataJson),
    };
  });

  const loadRows = await db.getAllAsync<any>(
    "SELECT * FROM rainbow_pyrolysis_biomass_loads WHERE batch_id = ? ORDER BY sequence ASC",
    [batchId],
  );
  const biomassLoads = loadRows.map((row) => {
    const mapped = rowToRainbowBiomassLoad(row);
    return {
      id: mapped.id,
      sequence: mapped.sequence,
      photo_local_uri: mapped.photoLocalUri,
      photo_url: mapped.photoUrl,
      photo_metadata: parseMetadata(mapped.photoMetadataJson),
      captured_at: mapped.capturedAt,
      note: mapped.note,
    } satisfies RainbowBiomassLoad;
  });

  return { batch, moisture, biomassLoads };
}

export function rainbowDraftToKontikkiData(draft: RainbowDraft): PyrolysisKontikkiData {
  return {
    batch_number: draft.batch.batchNumber ?? "",
    feedstock_quantity: draft.batch.feedstockQuantity,
    avg_feedstock_size_cm: draft.batch.avgFeedstockSizeCm,
    feedstock_id: draft.batch.feedstockId,
    feedstock_name: draft.batch.feedstockName ?? "",
    location:
      draft.batch.locationLat != null && draft.batch.locationLng != null
        ? {
            lat: draft.batch.locationLat,
            lng: draft.batch.locationLng,
            address: draft.batch.locationAddress,
          }
        : null,
    feedstock_photo_local_uri: draft.batch.feedstockPhotoLocalUri,
    feedstock_photo_url: draft.batch.feedstockPhotoUrl,
    feedstock_photo_metadata: parseMetadata(draft.batch.feedstockPhotoMetadataJson),
    feedstock_size_photo_local_uri: draft.batch.feedstockSizePhotoLocalUri,
    feedstock_size_photo_url: draft.batch.feedstockSizePhotoUrl,
    feedstock_size_photo_metadata: parseMetadata(draft.batch.feedstockSizePhotoMetadataJson),
    moisture_readings: draft.moisture,
    yield_percent: draft.batch.yieldPercent,
    comment: draft.batch.comment,
    yield_saved_at: draft.batch.yieldSavedAt,
    sample_id: draft.batch.sampleId,
    sample_photo_local_uri: draft.batch.samplePhotoLocalUri,
    sample_photo_url: draft.batch.samplePhotoUrl,
    sample_photo_metadata: parseMetadata(draft.batch.samplePhotoMetadataJson),
    sample_saved_at: draft.batch.sampleSavedAt,
    info_saved_at: draft.batch.infoSavedAt,
    moisture_saved_at: draft.batch.moistureSavedAt,
  };
}

export async function saveRainbowInfoLocal(
  batchId: string,
  data: PyrolysisKontikkiData,
) {
  const db = await getDb();
  const now = Date.now();
  const complete = isInfoSectionComplete(data);
  const patch = {
    batch_number: data.batch_number ?? null,
    feedstock_quantity: data.feedstock_quantity ?? null,
    avg_feedstock_size_cm: data.avg_feedstock_size_cm ?? null,
    feedstock_id: data.feedstock_id ?? null,
    feedstock_name: data.feedstock_name ?? null,
    location_lat: data.location?.lat ?? null,
    location_lng: data.location?.lng ?? null,
    location_address: data.location?.address ?? null,
    feedstock_photo_local_uri: data.feedstock_photo_local_uri ?? null,
    feedstock_photo_url: data.feedstock_photo_url ?? null,
    feedstock_size_photo_local_uri: data.feedstock_size_photo_local_uri ?? null,
    feedstock_size_photo_url: data.feedstock_size_photo_url ?? null,
    feedstock_photo_metadata_json: stringifyMetadata(data.feedstock_photo_metadata),
    feedstock_size_photo_metadata_json: stringifyMetadata(data.feedstock_size_photo_metadata),
    info_completed: complete ? 1 : 0,
    info_saved_at: complete ? data.info_saved_at ?? new Date().toISOString() : null,
    updated_at: now,
  };
  const { sql, args } = buildUpdate("rainbow_pyrolysis_batches", patch, "id = ?", [batchId]);
  await db.runAsync(sql, args);
}

export async function saveRainbowMoistureLocal(
  batchId: string,
  readings: MoistureReading[],
) {
  const db = await getDb();
  const now = Date.now();
  const complete = isRainbowMoistureComplete(readings);

  for (let index = 0; index < 10; index += 1) {
    const reading = readings[index];
    await db.runAsync(
      `UPDATE rainbow_pyrolysis_moisture
       SET reading = ?, photo_local_uri = ?, photo_url = ?, photo_metadata_json = ?, updated_at = ?
       WHERE batch_id = ? AND slot = ?`,
      [
        reading?.reading ?? null,
        reading?.photo_local_uri ?? null,
        reading?.photo_url ?? null,
        stringifyMetadata(reading?.photo_metadata),
        now,
        batchId,
        index + 1,
      ],
    );
  }

  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET moisture_completed = ?, moisture_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [complete ? 1 : 0, complete ? new Date().toISOString() : null, now, batchId],
  );
}

export async function saveRainbowBiomassLoadsLocal(
  batchId: string,
  loads: RainbowBiomassLoad[],
) {
  const db = await getDb();
  const now = Date.now();
  const normalized = loads.map((load, index) => ({
    ...load,
    id: load.id || generateId(),
    sequence: index + 1,
  }));
  const complete = isRainbowProductionComplete(normalized);

  await db.runAsync("DELETE FROM rainbow_pyrolysis_biomass_loads WHERE batch_id = ?", [batchId]);
  for (const load of normalized) {
    const insert = buildInsert("rainbow_pyrolysis_biomass_loads", {
      id: load.id,
      batch_id: batchId,
      sequence: load.sequence,
      photo_local_uri: load.photo_local_uri ?? null,
      photo_url: load.photo_url ?? null,
      photo_metadata_json: stringifyMetadata(load.photo_metadata),
      captured_at: load.captured_at ?? null,
      note: load.note ?? null,
      created_at: now,
      updated_at: now,
    });
    await db.runAsync(insert.sql, insert.args);
  }

  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET production_completed = ?, production_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [complete ? 1 : 0, complete ? new Date().toISOString() : null, now, batchId],
  );
}

export async function saveRainbowYieldLocal(batchId: string, data: PyrolysisKontikkiData) {
  const db = await getDb();
  const now = Date.now();
  const complete = isYieldSectionComplete(data);
  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET yield_percent = ?, comment = ?, yield_completed = ?, yield_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      data.yield_percent ?? null,
      data.comment ?? null,
      complete ? 1 : 0,
      complete ? new Date().toISOString() : null,
      now,
      batchId,
    ],
  );
}

export async function saveRainbowSampleLocal(batchId: string, data: PyrolysisKontikkiData) {
  const db = await getDb();
  const now = Date.now();
  const complete = isSampleSectionComplete(data);
  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET sample_id = ?, sample_photo_local_uri = ?, sample_photo_url = ?,
         sample_photo_metadata_json = ?, sample_completed = ?, sample_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      data.sample_id ?? null,
      data.sample_photo_local_uri ?? null,
      data.sample_photo_url ?? null,
      stringifyMetadata(data.sample_photo_metadata),
      complete ? 1 : 0,
      complete ? new Date().toISOString() : null,
      now,
      batchId,
    ],
  );
}

export function rainbowProgress(draft: RainbowDraft): number {
  return rainbowKontikkiWorkflowProgress(
    {
      infoCompleted: draft.batch.infoCompleted,
      moistureCompleted: draft.batch.moistureCompleted,
      productionCompleted: draft.batch.productionCompleted,
      yieldCompleted: draft.batch.yieldCompleted,
      sampleCompleted: draft.batch.sampleCompleted,
    },
    draft.biomassLoads,
  );
}

export function toRainbowApiRecord(draft: RainbowDraft): RainbowPyrolysisBatchRecord {
  return {
    id: draft.batch.serverId || draft.batch.id,
    session_id: draft.batch.sessionId,
    kontikki_id: draft.batch.kontikkiId,
    kontikki_code: draft.batch.kontikkiCode,
    producer_id: draft.batch.producerId,
    producer_name: draft.batch.producerName,
    protocol: "rainbow",
    batch_number: draft.batch.batchNumber,
    feedstock_quantity: draft.batch.feedstockQuantity,
    avg_feedstock_size_cm: draft.batch.avgFeedstockSizeCm,
    feedstock_id: draft.batch.feedstockId,
    feedstock_name: draft.batch.feedstockName,
    location_lat: draft.batch.locationLat,
    location_lng: draft.batch.locationLng,
    location_address: draft.batch.locationAddress,
    feedstock_photo_url: draft.batch.feedstockPhotoUrl,
    feedstock_size_photo_url: draft.batch.feedstockSizePhotoUrl,
    feedstock_photo_metadata: parseMetadata(draft.batch.feedstockPhotoMetadataJson),
    feedstock_size_photo_metadata: parseMetadata(draft.batch.feedstockSizePhotoMetadataJson),
    moisture: draft.moisture.map((item) => ({
      reading: item.reading,
      photo_url: item.photo_url,
      photo_metadata: item.photo_metadata,
    })),
    biomass_loads: draft.biomassLoads.map((load) => ({
      id: load.id,
      sequence: load.sequence,
      photo_url: load.photo_url,
      photo_metadata: load.photo_metadata,
      captured_at: load.captured_at,
      note: load.note,
    })),
    info_completed: draft.batch.infoCompleted,
    moisture_completed: draft.batch.moistureCompleted,
    production_completed: draft.batch.productionCompleted,
    yield_completed: draft.batch.yieldCompleted,
    sample_completed: draft.batch.sampleCompleted,
    info_saved_at: draft.batch.infoSavedAt,
    moisture_saved_at: draft.batch.moistureSavedAt,
    production_saved_at: draft.batch.productionSavedAt,
    yield_saved_at: draft.batch.yieldSavedAt,
    yield_percent: draft.batch.yieldPercent,
    comment: draft.batch.comment,
    sample_id: draft.batch.sampleId,
    sample_photo_url: draft.batch.samplePhotoUrl,
    sample_photo_metadata: parseMetadata(draft.batch.samplePhotoMetadataJson),
    sample_saved_at: draft.batch.sampleSavedAt,
    submission_status: draft.batch.submissionStatus === "submitted" ? "submitted" : "draft",
  };
}
