import type { RawEspBatch } from '../types/kiln';

export const MIN_JSON_BATCH_BYTES = 20;

export function parseKilnBatchBytes(rawBytes: Uint8Array): RawEspBatch {
  if (rawBytes.length < MIN_JSON_BATCH_BYTES) {
    throw new Error(
      `Batch file is too small (${rawBytes.length} bytes, min ${MIN_JSON_BATCH_BYTES}).`,
    );
  }

  const text = new TextDecoder('utf-8').decode(rawBytes).trim();
  if (!text.startsWith('{')) {
    throw new Error('Downloaded batch is not JSON.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Downloaded batch is not valid JSON.');
  }

  return validateRawBatch(parsed);
}

function validateRawBatch(value: unknown): RawEspBatch {
  if (!value || typeof value !== 'object') {
    throw new Error('Batch payload must be a JSON object.');
  }

  const row = value as Record<string, unknown>;
  const batchName = row.batch_name;
  const kilnId = row.kiln_id;
  const startTimeUtc = row.start_time_utc;
  const latitude = row.latitude;
  const longitude = row.longitude;
  const durationSeconds = row.duration_seconds;
  const dataPoints = row.data_points;
  const uptimeStartSeconds = row.uptime_start_seconds;

  if (typeof batchName !== 'string' || !batchName.trim()) {
    throw new Error('Missing or invalid batch_name.');
  }

  if (batchName.trim() === 'none') {
    throw new Error('No batch data on sensor.');
  }

  if (typeof kilnId !== 'string' || !kilnId.trim()) {
    throw new Error('Missing or invalid kiln_id.');
  }

  if (typeof startTimeUtc !== 'string' || Number.isNaN(Date.parse(startTimeUtc))) {
    throw new Error('Missing or invalid start_time_utc.');
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('Missing or invalid latitude/longitude.');
  }

  if (typeof durationSeconds !== 'number' || durationSeconds < 0) {
    throw new Error('Missing or invalid duration_seconds.');
  }

  if (!Array.isArray(dataPoints)) {
    throw new Error('Missing or invalid data_points array.');
  }

  const normalizedPoints = dataPoints.map((point, index) => {
    if (!point || typeof point !== 'object') {
      throw new Error(`data_points[${index}] must be an object.`);
    }

    const item = point as Record<string, unknown>;
    if (
      typeof item.time_offset_seconds !== 'number' ||
      typeof item.temperature !== 'number'
    ) {
      throw new Error(
        `data_points[${index}] missing time_offset_seconds or temperature.`,
      );
    }

    return {
      time_offset_seconds: item.time_offset_seconds,
      temperature: item.temperature,
    };
  });

  return {
    batch_name: batchName.trim(),
    kiln_id: kilnId.trim(),
    uptime_start_seconds:
      typeof uptimeStartSeconds === 'number' ? uptimeStartSeconds : 0,
    start_time_utc: startTimeUtc,
    latitude,
    longitude,
    duration_seconds: durationSeconds,
    data_points: normalizedPoints,
  };
}
