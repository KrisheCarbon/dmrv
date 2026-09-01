import {
  MOISTURE_READING_COUNT,
  PYROLYSIS_STAGE_KEYS,
  emptyMoistureReadings,
  type FieldPhotoMetadata,
  type MoistureReading,
  type PyrolysisKontikkiData,
  type PyrolysisStageKey,
  type PyrolysisStagePhoto,
  type PyrolysisStagePhotos,
} from "./pyrolysis";

export type MoistureSlot = 1 | 2 | 3 | 4 | 5;

export function moistureReadingKey(index: MoistureSlot): `moisture_reading_${MoistureSlot}` {
  return `moisture_reading_${index}`;
}

export function moisturePhotoUrlKey(index: MoistureSlot): `moisture_photo_url_${MoistureSlot}` {
  return `moisture_photo_url_${index}`;
}

export function moisturePhotoMetadataKey(
  index: MoistureSlot,
): `moisture_photo_metadata_${MoistureSlot}` {
  return `moisture_photo_metadata_${index}`;
}

export function moisturePhotoLocalUriKey(
  index: MoistureSlot,
): `moisture_photo_local_uri_${MoistureSlot}` {
  return `moisture_photo_local_uri_${index}`;
}

export function stagePhotoUrlKey(stage: PyrolysisStageKey): `stage_${PyrolysisStageKey}_photo_url` {
  return `stage_${stage}_photo_url`;
}

export function stagePhotoLocalUriKey(
  stage: PyrolysisStageKey,
): `stage_${PyrolysisStageKey}_photo_local_uri` {
  return `stage_${stage}_photo_local_uri`;
}

export function stageCapturedAtKey(
  stage: PyrolysisStageKey,
): `stage_${PyrolysisStageKey}_captured_at` {
  return `stage_${stage}_captured_at`;
}

export function stageSavedAtKey(stage: PyrolysisStageKey): `stage_${PyrolysisStageKey}_saved_at` {
  return `stage_${stage}_saved_at`;
}

export function stagePhotoMetadataKey(
  stage: PyrolysisStageKey,
): `stage_${PyrolysisStageKey}_photo_metadata` {
  return `stage_${stage}_photo_metadata`;
}

export type PyrolysisBatchFlatRow = {
  batch_number?: string | null;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  feedstock_id?: string | null;
  feedstock_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  feedstock_photo_url?: string | null;
  feedstock_size_photo_url?: string | null;
  feedstock_photo_metadata?: FieldPhotoMetadata | null;
  feedstock_size_photo_metadata?: FieldPhotoMetadata | null;
  moisture_reading_1?: number | null;
  moisture_reading_2?: number | null;
  moisture_reading_3?: number | null;
  moisture_reading_4?: number | null;
  moisture_reading_5?: number | null;
  moisture_photo_url_1?: string | null;
  moisture_photo_url_2?: string | null;
  moisture_photo_url_3?: string | null;
  moisture_photo_url_4?: string | null;
  moisture_photo_url_5?: string | null;
  moisture_photo_metadata_1?: FieldPhotoMetadata | null;
  moisture_photo_metadata_2?: FieldPhotoMetadata | null;
  moisture_photo_metadata_3?: FieldPhotoMetadata | null;
  moisture_photo_metadata_4?: FieldPhotoMetadata | null;
  moisture_photo_metadata_5?: FieldPhotoMetadata | null;
  stage_initial_photo_url?: string | null;
  stage_middle_photo_url?: string | null;
  stage_final_photo_url?: string | null;
  stage_quenching_photo_url?: string | null;
  stage_initial_captured_at?: string | null;
  stage_middle_captured_at?: string | null;
  stage_final_captured_at?: string | null;
  stage_quenching_captured_at?: string | null;
  stage_initial_saved_at?: string | null;
  stage_middle_saved_at?: string | null;
  stage_final_saved_at?: string | null;
  stage_quenching_saved_at?: string | null;
  stage_initial_photo_metadata?: FieldPhotoMetadata | null;
  stage_middle_photo_metadata?: FieldPhotoMetadata | null;
  stage_final_photo_metadata?: FieldPhotoMetadata | null;
  stage_quenching_photo_metadata?: FieldPhotoMetadata | null;
  yield_percent?: number | null;
  comment?: string | null;
  sample_id?: string | null;
  sample_photo_url?: string | null;
  sample_photo_metadata?: FieldPhotoMetadata | null;
  sample_saved_at?: string | null;
  info_completed?: boolean;
  moisture_completed?: boolean;
  pyrolysis_completed?: boolean;
  info_saved_at?: string | null;
  moisture_saved_at?: string | null;
  pyrolysis_saved_at?: string | null;
  yield_saved_at?: string | null;
};

export type PyrolysisBatchLocalRow = PyrolysisBatchFlatRow & {
  feedstock_photo_local_uri?: string | null;
  feedstock_size_photo_local_uri?: string | null;
  moisture_photo_local_uri_1?: string | null;
  moisture_photo_local_uri_2?: string | null;
  moisture_photo_local_uri_3?: string | null;
  moisture_photo_local_uri_4?: string | null;
  moisture_photo_local_uri_5?: string | null;
  stage_initial_photo_local_uri?: string | null;
  stage_middle_photo_local_uri?: string | null;
  stage_final_photo_local_uri?: string | null;
  stage_quenching_photo_local_uri?: string | null;
  sample_photo_local_uri?: string | null;
};

export function kontikkiDataToFlatRow(data: PyrolysisKontikkiData): PyrolysisBatchLocalRow {
  const row: PyrolysisBatchLocalRow = {
    batch_number: data.batch_number ?? null,
    feedstock_quantity: data.feedstock_quantity ?? null,
    avg_feedstock_size_cm: data.avg_feedstock_size_cm ?? null,
    feedstock_id: data.feedstock_id ?? null,
    feedstock_name: data.feedstock_name ?? null,
    location_lat: data.location?.lat ?? null,
    location_lng: data.location?.lng ?? null,
    location_address: data.location?.address ?? null,
    feedstock_photo_url: data.feedstock_photo_url ?? null,
    feedstock_size_photo_url: data.feedstock_size_photo_url ?? null,
    feedstock_photo_local_uri: data.feedstock_photo_local_uri ?? null,
    feedstock_size_photo_local_uri: data.feedstock_size_photo_local_uri ?? null,
    feedstock_photo_metadata: data.feedstock_photo_metadata ?? null,
    feedstock_size_photo_metadata: data.feedstock_size_photo_metadata ?? null,
    yield_percent: data.yield_percent ?? null,
    comment: data.comment ?? null,
    sample_id: data.sample_id ?? null,
    sample_photo_url: data.sample_photo_url ?? null,
    sample_photo_local_uri: data.sample_photo_local_uri ?? null,
    sample_photo_metadata: data.sample_photo_metadata ?? null,
    sample_saved_at: data.sample_saved_at ?? null,
    info_saved_at: data.info_saved_at ?? null,
    moisture_saved_at: data.moisture_saved_at ?? null,
    pyrolysis_saved_at: data.pyrolysis_saved_at ?? null,
    yield_saved_at: data.yield_saved_at ?? null,
  };

  const readings = data.moisture_readings ?? emptyMoistureReadings();
  for (let i = 1; i <= MOISTURE_READING_COUNT; i += 1) {
    const reading = readings[i - 1];
    const slot = i as MoistureSlot;
    row[moistureReadingKey(slot)] = reading?.reading ?? null;
    row[moisturePhotoUrlKey(slot)] = reading?.photo_url ?? null;
    row[moisturePhotoLocalUriKey(slot)] = reading?.photo_local_uri ?? null;
    row[moisturePhotoMetadataKey(slot)] = reading?.photo_metadata ?? null;
  }

  for (const stage of PYROLYSIS_STAGE_KEYS) {
    const photo = data.stage_photos?.[stage];
    row[stagePhotoUrlKey(stage)] = photo?.url ?? null;
    row[stagePhotoLocalUriKey(stage)] = photo?.local_uri ?? null;
    row[stageCapturedAtKey(stage)] = photo?.captured_at ?? null;
    row[stagePhotoMetadataKey(stage)] = photo?.metadata ?? null;
    row[stageSavedAtKey(stage)] = data.stage_saved_at?.[stage] ?? null;
  }

  return row;
}

export function flatRowToKontikkiData(row: PyrolysisBatchLocalRow): PyrolysisKontikkiData {
  const moisture_readings: MoistureReading[] = [];
  for (let i = 1; i <= MOISTURE_READING_COUNT; i += 1) {
    const slot = i as MoistureSlot;
    moisture_readings.push({
      reading: row[moistureReadingKey(slot)] ?? null,
      photo_url: row[moisturePhotoUrlKey(slot)] ?? null,
      photo_local_uri: row[moisturePhotoLocalUriKey(slot)] ?? null,
      photo_metadata: row[moisturePhotoMetadataKey(slot)] ?? null,
    });
  }

  const stage_photos: PyrolysisStagePhotos = {};
  const stage_saved_at: Partial<Record<PyrolysisStageKey, string>> = {};
  for (const stage of PYROLYSIS_STAGE_KEYS) {
    const photo: PyrolysisStagePhoto = {
      url: row[stagePhotoUrlKey(stage)] ?? null,
      local_uri: row[stagePhotoLocalUriKey(stage)] ?? null,
      captured_at: row[stageCapturedAtKey(stage)] ?? null,
      metadata: row[stagePhotoMetadataKey(stage)] ?? null,
    };
    if (
      photo.url ||
      photo.local_uri ||
      photo.captured_at ||
      photo.metadata ||
      row[stageSavedAtKey(stage)]
    ) {
      stage_photos[stage] = photo;
    }
    if (row[stageSavedAtKey(stage)]) {
      stage_saved_at[stage] = row[stageSavedAtKey(stage)]!;
    }
  }

  return {
    batch_number: row.batch_number ?? undefined,
    feedstock_quantity: row.feedstock_quantity ?? null,
    avg_feedstock_size_cm: row.avg_feedstock_size_cm ?? null,
    feedstock_id: row.feedstock_id ?? null,
    feedstock_name: row.feedstock_name ?? null,
    location:
      row.location_lat != null && row.location_lng != null
        ? {
            lat: row.location_lat,
            lng: row.location_lng,
            address: row.location_address ?? undefined,
          }
        : null,
    feedstock_photo_url: row.feedstock_photo_url ?? null,
    feedstock_size_photo_url: row.feedstock_size_photo_url ?? null,
    feedstock_photo_local_uri: row.feedstock_photo_local_uri ?? null,
    feedstock_size_photo_local_uri: row.feedstock_size_photo_local_uri ?? null,
    feedstock_photo_metadata: row.feedstock_photo_metadata ?? null,
    feedstock_size_photo_metadata: row.feedstock_size_photo_metadata ?? null,
    moisture_readings,
    stage_photos,
    stage_saved_at,
    yield_percent: row.yield_percent ?? null,
    comment: row.comment ?? null,
    sample_id: row.sample_id ?? null,
    sample_photo_url: row.sample_photo_url ?? null,
    sample_photo_local_uri: row.sample_photo_local_uri ?? null,
    sample_photo_metadata: row.sample_photo_metadata ?? null,
    sample_saved_at: row.sample_saved_at ?? null,
    info_saved_at: row.info_saved_at ?? null,
    moisture_saved_at: row.moisture_saved_at ?? null,
    pyrolysis_saved_at: row.pyrolysis_saved_at ?? null,
    yield_saved_at: row.yield_saved_at ?? null,
  };
}
