import { Injectable } from '@nestjs/common';

export interface RawEspDataPoint {
  time_offset_seconds: number;
  temperature: number;
}

export interface RawEspBatch {
  batch_name: string;
  kiln_id: string;
  uptime_start_seconds?: number;
  start_time_utc: string;
  latitude: number;
  longitude: number;
  duration_seconds: number;
  data_points: RawEspDataPoint[];
}

@Injectable()
export class KilnBatchParserService {
  parseBatch(value: unknown): RawEspBatch {
    return this.validateRawBatch(value);
  }

  private validateRawBatch(value: unknown): RawEspBatch {
    if (!value || typeof value !== 'object') {
      throw new KilnBatchParseError('invalid_json', 'Batch payload must be a JSON object');
    }

    const row = value as Record<string, unknown>;
    const batchName = row.batch_name;
    const kilnId = row.kiln_id;
    const startTimeUtc = row.start_time_utc;
    const latitude = row.latitude;
    const longitude = row.longitude;
    const durationSeconds = row.duration_seconds;
    const dataPoints = row.data_points;

    if (typeof batchName !== 'string' || !batchName.trim()) {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid batch_name');
    }

    if (typeof kilnId !== 'string' || !kilnId.trim()) {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid kiln_id');
    }

    if (typeof startTimeUtc !== 'string' || Number.isNaN(Date.parse(startTimeUtc))) {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid start_time_utc');
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid latitude/longitude');
    }

    if (typeof durationSeconds !== 'number' || durationSeconds < 0) {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid duration_seconds');
    }

    if (!Array.isArray(dataPoints)) {
      throw new KilnBatchParseError('invalid_json', 'Missing or invalid data_points array');
    }

    const normalizedPoints: RawEspDataPoint[] = dataPoints.map((point, index) => {
      if (!point || typeof point !== 'object') {
        throw new KilnBatchParseError(
          'invalid_json',
          `data_points[${index}] must be an object`,
        );
      }

      const item = point as Record<string, unknown>;
      if (
        typeof item.time_offset_seconds !== 'number' ||
        typeof item.temperature !== 'number'
      ) {
        throw new KilnBatchParseError(
          'invalid_json',
          `data_points[${index}] missing time_offset_seconds or temperature`,
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
        typeof row.uptime_start_seconds === 'number'
          ? row.uptime_start_seconds
          : undefined,
      start_time_utc: startTimeUtc,
      latitude,
      longitude,
      duration_seconds: durationSeconds,
      data_points: normalizedPoints,
    };
  }
}

export class KilnBatchParseError extends Error {
  constructor(
    readonly reason: 'invalid_json',
    message: string,
  ) {
    super(message);
    this.name = 'KilnBatchParseError';
  }
}
