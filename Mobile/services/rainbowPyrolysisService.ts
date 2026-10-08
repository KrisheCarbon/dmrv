import {
  emptyRainbowMoistureReadings,
  isRainbowInfoComplete,
  isRainbowMoistureComplete,
  isRainbowProductionComplete,
  isRainbowSampleCollectionComplete,
  rainbowRequiredMoistureCount,
  type RainbowFeedstockClass,
  type RainbowProcessProof,
  rainbowKontikkiWorkflowProgress,
  type FieldPhotoMetadata,
  type MoistureReading,
  type PyrolysisKontikkiData,
  type RainbowBiomassLoad,
  type RainbowPyrolysisBatchRecord,
  type RainbowSampleSpot,
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
  isSampleSectionComplete,
  isYieldSectionComplete,
} from "../utils/pyrolysisSectionValidation";

const LOCAL_SYNC_STATUS = "local";

function parseSampleSpots(raw: string | null | undefined): RainbowSampleSpot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RainbowSampleSpot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function parseQuenchPhotos(raw: string | null | undefined): PyrolysisKontikkiData["quench_photos"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PyrolysisKontikkiData["quench_photos"];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function quenchProof(data: PyrolysisKontikkiData): Pick<
  RainbowProcessProof,
  "quenchStartPhoto" | "quenchEndPhoto" | "quenchVideo" | "quenchPhotoCount"
> {
  const photos = (data.quench_photos ?? []).filter(
    (photo) => photo.photo_local_uri || photo.photo_url,
  );
  const first = photos[0];
  const last = photos.length >= 2 ? photos[photos.length - 1] : undefined;
  return {
    quenchStartPhoto:
      first?.photo_local_uri ||
      first?.photo_url ||
      data.quench_start_photo_local_uri ||
      data.quench_start_photo_url,
    quenchEndPhoto:
      last?.photo_local_uri ||
      last?.photo_url ||
      (photos.length >= 2 ? undefined : data.quench_end_photo_local_uri || data.quench_end_photo_url),
    quenchVideo: data.quench_video_local_uri || data.quench_video_url,
    quenchPhotoCount: photos.length,
  };
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
    generatedBatchCode: null,
    feedstockQuantity: null,
    avgFeedstockSizeCm: null,
    feedstockId: null,
    feedstockName: null,
    locationLat: null,
    locationLng: null,
    locationAddress: null,
    kilnPhotoLocalUri: null,
    kilnPhotoUrl: null,
    kilnPhotoMetadataJson: null,
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
    sampleSpotsJson: null,
    samplePilePhotoLocalUri: null,
    samplePilePhotoUrl: null,
    samplePilePhotoMetadataJson: null,
    sampleBagCode: null,
    sampleBagPhotoLocalUri: null,
    sampleBagPhotoUrl: null,
    sampleBagPhotoMetadataJson: null,
    sampleBagNotUsed: false,
    sampleCollectedAt: null,
    feedstockClass: null,
    lastLayerConfirmed: false,
    flameCurtainPhotoLocalUri: null,
    flameCurtainPhotoUrl: null,
    flameCurtainPhotoMetadataJson: null,
    quenchStartPhotoLocalUri: null,
    quenchStartPhotoUrl: null,
    quenchStartPhotoMetadataJson: null,
    quenchEndPhotoLocalUri: null,
    quenchEndPhotoUrl: null,
    quenchEndPhotoMetadataJson: null,
    quenchPhotosJson: null,
    quenchVideoLocalUri: null,
    quenchVideoUrl: null,
    quenchVideoMetadataJson: null,
    quenchVideoDurationSeconds: null,
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
  const required = rainbowRequiredMoistureCount(batch.feedstockName);
  const storedCount = moistureRows.reduce(
    (max, row) => Math.max(max, Number(row.slot) || 0),
    0,
  );
  const moisture = emptyRainbowMoistureReadings(Math.max(required, storedCount)).map((empty, index) => {
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
    feedstock_class: draft.batch.feedstockClass,
    location:
      draft.batch.locationLat != null && draft.batch.locationLng != null
        ? {
            lat: draft.batch.locationLat,
            lng: draft.batch.locationLng,
            address: draft.batch.locationAddress,
          }
        : null,
    kiln_photo_local_uri: draft.batch.kilnPhotoLocalUri,
    kiln_photo_url: draft.batch.kilnPhotoUrl,
    kiln_photo_metadata: parseMetadata(draft.batch.kilnPhotoMetadataJson),
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
    sample_spots: parseSampleSpots(draft.batch.sampleSpotsJson),
    sample_pile_photo_local_uri: draft.batch.samplePilePhotoLocalUri,
    sample_pile_photo_url: draft.batch.samplePilePhotoUrl,
    sample_pile_photo_metadata: parseMetadata(draft.batch.samplePilePhotoMetadataJson),
    sample_bag_code: draft.batch.sampleBagCode,
    sample_bag_photo_local_uri: draft.batch.sampleBagPhotoLocalUri,
    sample_bag_photo_url: draft.batch.sampleBagPhotoUrl,
    sample_bag_photo_metadata: parseMetadata(draft.batch.sampleBagPhotoMetadataJson),
    sample_bag_not_used: draft.batch.sampleBagNotUsed,
    sample_collected_at: draft.batch.sampleCollectedAt,
    info_saved_at: draft.batch.infoSavedAt,
    moisture_saved_at: draft.batch.moistureSavedAt,
    last_layer_confirmed: draft.batch.lastLayerConfirmed,
    flame_curtain_photo_local_uri: draft.batch.flameCurtainPhotoLocalUri,
    flame_curtain_photo_url: draft.batch.flameCurtainPhotoUrl,
    flame_curtain_photo_metadata: parseMetadata(draft.batch.flameCurtainPhotoMetadataJson),
    quench_start_photo_local_uri: draft.batch.quenchStartPhotoLocalUri,
    quench_start_photo_url: draft.batch.quenchStartPhotoUrl,
    quench_start_photo_metadata: parseMetadata(draft.batch.quenchStartPhotoMetadataJson),
    quench_end_photo_local_uri: draft.batch.quenchEndPhotoLocalUri,
    quench_end_photo_url: draft.batch.quenchEndPhotoUrl,
    quench_end_photo_metadata: parseMetadata(draft.batch.quenchEndPhotoMetadataJson),
    quench_photos: parseQuenchPhotos(draft.batch.quenchPhotosJson),
    quench_video_local_uri: draft.batch.quenchVideoLocalUri,
    quench_video_url: draft.batch.quenchVideoUrl,
    quench_video_metadata: parseMetadata(draft.batch.quenchVideoMetadataJson),
    quench_video_duration_seconds: draft.batch.quenchVideoDurationSeconds,
  };
}

export async function saveRainbowInfoLocal(
  batchId: string,
  data: PyrolysisKontikkiData,
) {
  const db = await getDb();
  const now = Date.now();
  const feedstockClass: RainbowFeedstockClass | null =
    data.feedstock_class === "woody" || data.feedstock_class === "other"
      ? data.feedstock_class
      : null;
  const complete = isRainbowInfoComplete({
    batchNumber: data.batch_number,
    feedstockId: data.feedstock_id,
    feedstockName: data.feedstock_name,
    feedstockClass,
    feedstockPhoto: data.feedstock_photo_local_uri || data.feedstock_photo_url,
    kilnPhoto: data.kiln_photo_local_uri || data.kiln_photo_url,
  });
  const patch = {
    batch_number: data.batch_number ?? null,
    feedstock_quantity: data.feedstock_quantity ?? null,
    avg_feedstock_size_cm: data.avg_feedstock_size_cm ?? null,
    feedstock_id: data.feedstock_id ?? null,
    feedstock_name: data.feedstock_name ?? null,
    feedstock_class: feedstockClass,
    location_lat: data.location?.lat ?? null,
    location_lng: data.location?.lng ?? null,
    location_address: data.location?.address ?? null,
    kiln_photo_local_uri: data.kiln_photo_local_uri ?? null,
    kiln_photo_url: data.kiln_photo_url ?? null,
    kiln_photo_metadata_json: stringifyMetadata(data.kiln_photo_metadata),
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
  await ensureRainbowMoistureSlots(batchId, data.feedstock_name);
  await refreshRainbowMoistureCompletion(batchId, data.feedstock_name, feedstockClass);
}

async function ensureRainbowMoistureSlots(
  batchId: string,
  feedstockName: string | null | undefined,
) {
  const db = await getDb();
  const required = rainbowRequiredMoistureCount(feedstockName);
  const rows = await db.getAllAsync<{
    slot: number;
    reading: number | null;
    photo_local_uri: string | null;
    photo_url: string | null;
  }>(
    "SELECT slot, reading, photo_local_uri, photo_url FROM rainbow_pyrolysis_moisture WHERE batch_id = ?",
    [batchId],
  );
  const have = new Set(rows.map((row) => Number(row.slot)));
  const now = Date.now();
  for (let slot = 1; slot <= required; slot += 1) {
    if (have.has(slot)) continue;
    const insert = buildInsert("rainbow_pyrolysis_moisture", {
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
    await db.runAsync(insert.sql, insert.args);
  }
  for (const row of rows) {
    const slot = Number(row.slot);
    const empty = row.reading == null && !row.photo_local_uri && !row.photo_url;
    if (slot > required && empty) {
      await db.runAsync(
        "DELETE FROM rainbow_pyrolysis_moisture WHERE batch_id = ? AND slot = ?",
        [batchId, slot],
      );
    }
  }
}

async function refreshRainbowMoistureCompletion(
  batchId: string,
  feedstockName: string | null | undefined,
  feedstockClass: RainbowFeedstockClass | null | undefined,
) {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    slot: number;
    reading: number | null;
    photo_local_uri: string | null;
    photo_url: string | null;
  }>(
    "SELECT slot, reading, photo_local_uri, photo_url FROM rainbow_pyrolysis_moisture WHERE batch_id = ? ORDER BY slot ASC",
    [batchId],
  );
  const readings = rows.map((row) => ({
    reading: row.reading != null ? Number(row.reading) : null,
    photo_local_uri: row.photo_local_uri,
    photo_url: row.photo_url,
  }));
  const complete = isRainbowMoistureComplete(readings, feedstockName, feedstockClass);
  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET moisture_completed = ?, moisture_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [complete ? 1 : 0, complete ? new Date().toISOString() : null, Date.now(), batchId],
  );
}

export async function saveRainbowMoistureLocal(
  batchId: string,
  readings: MoistureReading[],
) {
  const db = await getDb();
  const now = Date.now();
  const batch = await getRainbowBatch(batchId);
  const complete = isRainbowMoistureComplete(
    readings,
    batch?.feedstockName,
    batch?.feedstockClass,
  );

  for (let index = 0; index < readings.length; index += 1) {
    const reading = readings[index];
    const slot = index + 1;
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM rainbow_pyrolysis_moisture WHERE batch_id = ? AND slot = ?",
      [batchId, slot],
    );
    if (existing) {
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
          slot,
        ],
      );
    } else {
      const insert = buildInsert("rainbow_pyrolysis_moisture", {
        id: generateId(),
        batch_id: batchId,
        slot,
        reading: reading?.reading ?? null,
        photo_local_uri: reading?.photo_local_uri ?? null,
        photo_url: reading?.photo_url ?? null,
        photo_metadata_json: stringifyMetadata(reading?.photo_metadata),
        created_at: now,
        updated_at: now,
      });
      await db.runAsync(insert.sql, insert.args);
    }
  }

  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET moisture_completed = ?, moisture_saved_at = ?, updated_at = ?
     WHERE id = ?`,
    [complete ? 1 : 0, complete ? new Date().toISOString() : null, now, batchId],
  );
}

function proofFromBatch(batch: RainbowPyrolysisBatch | null): RainbowProcessProof {
  const photos = parseQuenchPhotos(batch?.quenchPhotosJson);
  const filled = photos.filter((photo) => photo.photo_local_uri || photo.photo_url);
  return {
    lastLayerConfirmed: Boolean(batch?.lastLayerConfirmed),
    flameCurtainPhoto: batch?.flameCurtainPhotoLocalUri || batch?.flameCurtainPhotoUrl,
    quenchStartPhoto:
      filled[0]?.photo_local_uri ||
      filled[0]?.photo_url ||
      batch?.quenchStartPhotoLocalUri ||
      batch?.quenchStartPhotoUrl,
    quenchEndPhoto:
      (filled.length >= 2 ? filled[filled.length - 1]?.photo_local_uri || filled[filled.length - 1]?.photo_url : null) ||
      batch?.quenchEndPhotoLocalUri ||
      batch?.quenchEndPhotoUrl,
    quenchVideo: batch?.quenchVideoLocalUri || batch?.quenchVideoUrl,
    quenchPhotoCount: filled.length,
  };
}

export async function saveRainbowBiomassLoadsLocal(
  batchId: string,
  loads: RainbowBiomassLoad[],
  data?: PyrolysisKontikkiData,
) {
  const db = await getDb();
  const now = Date.now();
  const normalized = loads.map((load, index) => ({
    ...load,
    id: load.id || generateId(),
    sequence: index + 1,
  }));
  const batch = await getRainbowBatch(batchId);
  const fromDraft = data ? quenchProof(data) : null;
  const resolved: RainbowProcessProof = data
    ? {
        lastLayerConfirmed: Boolean(data.last_layer_confirmed),
        flameCurtainPhoto: data.flame_curtain_photo_local_uri || data.flame_curtain_photo_url,
        ...fromDraft,
      }
    : proofFromBatch(batch);
  const complete = isRainbowProductionComplete(normalized, resolved);
  const photos = data ?? {
    last_layer_confirmed: batch?.lastLayerConfirmed,
    flame_curtain_photo_local_uri: batch?.flameCurtainPhotoLocalUri,
    flame_curtain_photo_url: batch?.flameCurtainPhotoUrl,
    flame_curtain_photo_metadata: parseMetadata(batch?.flameCurtainPhotoMetadataJson),
    quench_start_photo_local_uri: batch?.quenchStartPhotoLocalUri,
    quench_start_photo_url: batch?.quenchStartPhotoUrl,
    quench_start_photo_metadata: parseMetadata(batch?.quenchStartPhotoMetadataJson),
    quench_end_photo_local_uri: batch?.quenchEndPhotoLocalUri,
    quench_end_photo_url: batch?.quenchEndPhotoUrl,
    quench_end_photo_metadata: parseMetadata(batch?.quenchEndPhotoMetadataJson),
    quench_photos: parseQuenchPhotos(batch?.quenchPhotosJson),
    quench_video_local_uri: batch?.quenchVideoLocalUri,
    quench_video_url: batch?.quenchVideoUrl,
    quench_video_metadata: parseMetadata(batch?.quenchVideoMetadataJson),
    quench_video_duration_seconds: batch?.quenchVideoDurationSeconds,
  };

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
     SET production_completed = ?, production_saved_at = ?, updated_at = ?,
         last_layer_confirmed = ?,
         flame_curtain_photo_local_uri = ?,
         flame_curtain_photo_url = ?,
         flame_curtain_photo_metadata_json = ?,
         quench_start_photo_local_uri = ?,
         quench_start_photo_url = ?,
         quench_start_photo_metadata_json = ?,
         quench_end_photo_local_uri = ?,
         quench_end_photo_url = ?,
         quench_end_photo_metadata_json = ?,
         quench_photos_json = ?,
         quench_video_local_uri = ?,
         quench_video_url = ?,
         quench_video_metadata_json = ?,
         quench_video_duration_seconds = ?
     WHERE id = ?`,
    [
      complete ? 1 : 0,
      complete ? new Date().toISOString() : null,
      now,
      resolved.lastLayerConfirmed ? 1 : 0,
      photos.flame_curtain_photo_local_uri ?? null,
      photos.flame_curtain_photo_url ?? null,
      stringifyMetadata(photos.flame_curtain_photo_metadata),
      photos.quench_start_photo_local_uri ?? null,
      photos.quench_start_photo_url ?? null,
      stringifyMetadata(photos.quench_start_photo_metadata),
      photos.quench_end_photo_local_uri ?? null,
      photos.quench_end_photo_url ?? null,
      stringifyMetadata(photos.quench_end_photo_metadata),
      JSON.stringify(photos.quench_photos ?? []),
      photos.quench_video_local_uri ?? null,
      photos.quench_video_url ?? null,
      stringifyMetadata(photos.quench_video_metadata),
      photos.quench_video_duration_seconds ?? null,
      batchId,
    ],
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

export async function saveRainbowSampleCollection(
  batchId: string,
  data: PyrolysisKontikkiData,
) {
  const db = await getDb();
  const now = Date.now();
  const complete = isRainbowSampleCollectionComplete({
    spots: data.sample_spots,
    pilePhotoUrl: data.sample_pile_photo_url,
    pilePhotoLocalUri: data.sample_pile_photo_local_uri,
    bagNotUsed: data.sample_bag_not_used,
    bagCode: data.sample_bag_code,
    bagPhotoUrl: data.sample_bag_photo_url,
    bagPhotoLocalUri: data.sample_bag_photo_local_uri,
  });
  await db.runAsync(
    `UPDATE rainbow_pyrolysis_batches
     SET sample_spots_json = ?,
         sample_pile_photo_local_uri = ?, sample_pile_photo_url = ?, sample_pile_photo_metadata_json = ?,
         sample_bag_code = ?, sample_bag_photo_local_uri = ?, sample_bag_photo_url = ?,
         sample_bag_photo_metadata_json = ?, sample_bag_not_used = ?,
         sample_collected_at = ?, sample_completed = ?, updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(data.sample_spots ?? []),
      data.sample_pile_photo_local_uri ?? null,
      data.sample_pile_photo_url ?? null,
      stringifyMetadata(data.sample_pile_photo_metadata),
      data.sample_bag_code ?? null,
      data.sample_bag_photo_local_uri ?? null,
      data.sample_bag_photo_url ?? null,
      stringifyMetadata(data.sample_bag_photo_metadata),
      data.sample_bag_not_used ? 1 : 0,
      complete ? data.sample_collected_at ?? new Date().toISOString() : null,
      complete ? 1 : 0,
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
    feedstock_class: draft.batch.feedstockClass,
    location_lat: draft.batch.locationLat,
    location_lng: draft.batch.locationLng,
    location_address: draft.batch.locationAddress,
    kiln_photo_url: draft.batch.kilnPhotoUrl,
    kiln_photo_metadata: parseMetadata(draft.batch.kilnPhotoMetadataJson),
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
    sample_spots: parseSampleSpots(draft.batch.sampleSpotsJson)?.map((spot) => ({
      spot: spot.spot,
      photo_url: spot.photo_url,
      photo_metadata: spot.photo_metadata,
    })),
    sample_pile_photo_url: draft.batch.samplePilePhotoUrl,
    sample_pile_photo_metadata: parseMetadata(draft.batch.samplePilePhotoMetadataJson),
    sample_bag_code: draft.batch.sampleBagCode,
    sample_bag_photo_url: draft.batch.sampleBagPhotoUrl,
    sample_bag_photo_metadata: parseMetadata(draft.batch.sampleBagPhotoMetadataJson),
    sample_bag_not_used: draft.batch.sampleBagNotUsed,
    sample_collected_at: draft.batch.sampleCollectedAt,
    last_layer_confirmed: draft.batch.lastLayerConfirmed,
    flame_curtain_photo_url: draft.batch.flameCurtainPhotoUrl,
    flame_curtain_photo_metadata: parseMetadata(draft.batch.flameCurtainPhotoMetadataJson),
    quench_start_photo_url: draft.batch.quenchStartPhotoUrl,
    quench_start_photo_metadata: parseMetadata(draft.batch.quenchStartPhotoMetadataJson),
    quench_end_photo_url: draft.batch.quenchEndPhotoUrl,
    quench_end_photo_metadata: parseMetadata(draft.batch.quenchEndPhotoMetadataJson),
    quench_photos: parseQuenchPhotos(draft.batch.quenchPhotosJson)?.map((photo) => ({
      id: photo.id,
      photo_url: photo.photo_url,
      photo_metadata: photo.photo_metadata,
    })),
    quench_video_url: draft.batch.quenchVideoUrl,
    quench_video_metadata: parseMetadata(draft.batch.quenchVideoMetadataJson),
    quench_video_duration_seconds: draft.batch.quenchVideoDurationSeconds,
    submission_status: draft.batch.submissionStatus === "submitted" ? "submitted" : "draft",
  };
}
