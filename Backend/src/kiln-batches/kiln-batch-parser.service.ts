import { Injectable } from '@nestjs/common';

export interface RawEspDataPoint {
  time_offset_seconds: number;
  temperature: number;
  top_c: number | null;
  middle_c: number | null;
  bottom_c: number | null;
  kiln_state: string | null;
  top_valid: boolean | null;
  middle_valid: boolean | null;
  bottom_valid: boolean | null;
  top_open: boolean | null;
  middle_open: boolean | null;
  bottom_open: boolean | null;
  top_rate: number | null;
  middle_rate: number | null;
  bottom_rate: number | null;
  latitude: number | null;
  longitude: number | null;
  satellites: number | null;
  utc_epoch: number | null;
  uptime_s: number | null;
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
      const temperature = this.readingTemperature(item);
      if (typeof item.time_offset_seconds !== 'number' || temperature == null) {
        throw new KilnBatchParseError(
          'invalid_json',
          `data_points[${index}] missing time_offset_seconds or temperature`,
        );
      }

      return {
        time_offset_seconds: item.time_offset_seconds,
        temperature,
        top_c: this.optionalNumber(item.top_c),
        middle_c: this.optionalNumber(item.middle_c),
        bottom_c: this.optionalNumber(item.bottom_c),
        kiln_state: this.optionalText(item.kiln_state),
        top_valid: this.optionalBool(item.top_valid),
        middle_valid: this.optionalBool(item.middle_valid),
        bottom_valid: this.optionalBool(item.bottom_valid),
        top_open: this.optionalBool(item.top_open),
        middle_open: this.optionalBool(item.middle_open),
        bottom_open: this.optionalBool(item.bottom_open),
        top_rate: this.optionalNumber(item.top_rate),
        middle_rate: this.optionalNumber(item.middle_rate),
        bottom_rate: this.optionalNumber(item.bottom_rate),
        latitude: this.optionalNumber(item.latitude),
        longitude: this.optionalNumber(item.longitude),
        satellites: this.optionalNumber(item.satellites),
        utc_epoch: this.optionalNumber(item.utc_epoch),
        uptime_s: this.optionalNumber(item.uptime_s),
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

  private optionalBool(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === 0) return value === 1;
    return null;
  }

  private optionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readingTemperature(item: Record<string, unknown>): number | null {
    if (typeof item.temperature === 'number' && Number.isFinite(item.temperature)) {
      return item.temperature;
    }

    const zones = [item.middle_c, item.top_c, item.bottom_c].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (zones.length === 0) return null;
    return zones.reduce((sum, value) => sum + value, 0) / zones.length;
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
