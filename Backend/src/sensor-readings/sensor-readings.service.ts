import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

export interface LiveSensor {
  device_id: string | null;
  reading_count: number;
  first_at: string;
  last_at: string;
  live: boolean;
  latest_payload: Record<string, unknown> | null;
}

export interface SensorReadingRow {
  id: string;
  device_id: string | null;
  idempotency_key: string | null;
  received_at: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class SensorReadingsService {
  private readonly lambda: LambdaClient;

  constructor(private readonly config: ConfigService) {
    this.lambda = new LambdaClient({
      region: this.config.get<string>('AWS_REGION')?.trim() || 'ap-south-1',
    });
  }

  listSensors() {
    return this.invoke<{ sensors: LiveSensor[]; live_within_seconds: number }>({
      krishe_admin: true,
      action: 'sensors',
    });
  }

  readings(deviceId: string, limit?: number, from?: string, to?: string) {
    return this.invoke<{
      device_id: string;
      total: number;
      readings: SensorReadingRow[];
    }>({
      krishe_admin: true,
      action: 'readings',
      deviceId,
      limit,
      from: this.isoTime(from),
      to: this.isoTime(to),
    });
  }

  private isoTime(value?: string): string | undefined {
    if (!value?.trim()) return undefined;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return undefined;
    return new Date(ms).toISOString();
  }

  private async invoke<T>(payload: Record<string, unknown>): Promise<T> {
    const name =
      this.config.get<string>('SENSOR_LAMBDA_FUNCTION')?.trim() ||
      'krishecarbon-sensor-ingest';
    let response;
    try {
      response = await this.lambda.send(
        new InvokeCommand({
          FunctionName: name,
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );
    } catch {
      throw new ServiceUnavailableException('Sensor readings are unavailable');
    }
    if (response.FunctionError || !response.Payload) {
      throw new ServiceUnavailableException('Sensor readings are unavailable');
    }
    const decoded = JSON.parse(Buffer.from(response.Payload).toString('utf8')) as {
      statusCode?: number;
      body?: string;
    };
    const body = decoded.body ? (JSON.parse(decoded.body) as T & { error?: string }) : null;
    if (!decoded.statusCode || decoded.statusCode >= 400 || !body) {
      throw new ServiceUnavailableException('Sensor readings are unavailable');
    }
    return body;
  }
}
