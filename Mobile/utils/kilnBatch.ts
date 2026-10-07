import type { RawEspBatch } from '../types/kiln';

function optionalBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  return null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readingTemperature(item: Record<string, unknown>): number | null {
  if (typeof item.temperature === 'number' && Number.isFinite(item.temperature)) {
    return item.temperature;
  }

  const zones = [item.middle_c, item.top_c, item.bottom_c].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (zones.length === 0) return null;
  return zones.reduce((sum, value) => sum + value, 0) / zones.length;
}

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
    const temperature = readingTemperature(item);
    if (typeof item.time_offset_seconds !== 'number' || temperature == null) {
      throw new Error(
        `data_points[${index}] missing time_offset_seconds or temperature.`,
      );
    }

    return {
      time_offset_seconds: item.time_offset_seconds,
      temperature,
      top_c: optionalNumber(item.top_c),
      middle_c: optionalNumber(item.middle_c),
      bottom_c: optionalNumber(item.bottom_c),
      kiln_state: optionalText(item.kiln_state),
      top_valid: optionalBool(item.top_valid),
      middle_valid: optionalBool(item.middle_valid),
      bottom_valid: optionalBool(item.bottom_valid),
      top_open: optionalBool(item.top_open),
      middle_open: optionalBool(item.middle_open),
      bottom_open: optionalBool(item.bottom_open),
      top_rate: optionalNumber(item.top_rate),
      middle_rate: optionalNumber(item.middle_rate),
      bottom_rate: optionalNumber(item.bottom_rate),
      latitude: optionalNumber(item.latitude),
      longitude: optionalNumber(item.longitude),
      satellites: optionalNumber(item.satellites),
      utc_epoch: optionalNumber(item.utc_epoch),
      uptime_s: optionalNumber(item.uptime_s),
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

export function describeSavedKilnBatch(payload: string): string[] {
  try {
    const batch = JSON.parse(payload) as { data_points?: Array<Record<string, unknown>> };
    const points = Array.isArray(batch.data_points) ? batch.data_points : [];
    const last = points[points.length - 1] ?? {};
    const zone = (label: string, tempKey: string, openKey: string, rateKey: string) => {
      if (last[openKey] === true) return `${label} probe open`;
      const temp = last[tempKey];
      const rate = last[rateKey];
      const tempText = typeof temp === 'number' ? `${temp.toFixed(1)} °C` : 'no reading';
      const rateText = typeof rate === 'number' ? `, ${rate.toFixed(1)} °C/s` : '';
      return `${label} ${tempText}${rateText}`;
    };

    const lines = [
      `${points.length} readings received`,
      typeof last.kiln_state === 'string' ? `Kiln state ${last.kiln_state}` : 'Kiln state not recorded',
      zone('Top', 'top_c', 'top_open', 'top_rate'),
      zone('Middle', 'middle_c', 'middle_open', 'middle_rate'),
      zone('Bottom', 'bottom_c', 'bottom_open', 'bottom_rate'),
    ];

    if (typeof last.satellites === 'number') {
      lines.push(`${last.satellites} satellites`);
    }
    if (typeof last.uptime_s === 'number') {
      lines.push(`Module uptime ${last.uptime_s} s`);
    }
    return lines;
  } catch {
    return ['Received recording'];
  }
}

export function kilnBatchToCsv(payload: string): string {
  const batch = JSON.parse(payload) as { data_points?: Array<Record<string, unknown>> };
  const points = Array.isArray(batch.data_points) ? batch.data_points : [];
  const header = [
    'time_offset_seconds',
    'state',
    'top_c',
    'middle_c',
    'bottom_c',
    'top_valid',
    'middle_valid',
    'bottom_valid',
    'top_open',
    'middle_open',
    'bottom_open',
    'top_rate',
    'middle_rate',
    'bottom_rate',
    'latitude',
    'longitude',
    'satellites',
    'utc_epoch',
    'uptime_s',
  ];
  const rows = points.map((point) =>
    header
      .map((key) => {
        const value = key === 'state' ? point.kiln_state : point[key];
        if (value == null) return '';
        const text = String(value);
        return text.includes(',') ? `"${text}"` : text;
      })
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}
