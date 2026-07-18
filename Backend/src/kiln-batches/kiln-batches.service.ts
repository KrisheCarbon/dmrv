import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessNetwork } from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';
import {
  KilnBatchParseError,
  KilnBatchParserService,
  RawEspBatch,
} from './kiln-batch-parser.service';

export interface SyncKilnBatchPayload {
  localId: string;
  kilnId: string;
  kontikkiId: string;
  sourceFilename: string;
  batch: RawEspBatch;
  receivedAt?: number;
}

@Injectable()
export class KilnBatchesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly batchParser: KilnBatchParserService,
    private readonly mobileNetwork: MobileNetworkService,
  ) {}

  async syncBatch(user: AuthenticatedUser, payload: SyncKilnBatchPayload) {
    const kontikki = await this.resolveAuthorizedKontikki(user, payload.kontikkiId);

    let batch: RawEspBatch;

    try {
      batch = this.batchParser.parseBatch(payload.batch);
    } catch (err) {
      if (err instanceof KilnBatchParseError) {
        throw new ForbiddenException({
          reason: err.reason,
          message: err.message,
        });
      }
      throw err;
    }

    if (!kontikki.module_id) {
      throw new ForbiddenException(
        'This kontikki has no hardware module ID configured. Ask an admin to set it in the portal.',
      );
    }

    if (batch.kiln_id.trim() !== kontikki.module_id.trim()) {
      throw new ForbiddenException(
        `Hardware module ID "${batch.kiln_id}" does not match kontikki module "${kontikki.module_id}".`,
      );
    }

    const { data: existing, error: existingError } = await this.supabase
      .from('kiln_batches')
      .select('id')
      .eq('source_filename', payload.sourceFilename)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to check existing batch: ${existingError.message}`);
    }

    if (existing) {
      return {
        id: existing.id,
        batchName: batch.batch_name,
        alreadySynced: true,
      };
    }

    const startTime = new Date(batch.start_time_utc);
    const endedAt = new Date(startTime.getTime() + batch.duration_seconds * 1000);

    const { data: insertedBatch, error: batchError } = await this.supabase
      .from('kiln_batches')
      .insert({
        batch_name: batch.batch_name,
        kiln_id: batch.kiln_id,
        latitude: batch.latitude,
        longitude: batch.longitude,
        start_time_utc: startTime.toISOString(),
        duration_seconds: batch.duration_seconds,
        ended_at: endedAt.toISOString(),
        source_filename: payload.sourceFilename,
        uploaded_by: user.id,
        local_id: payload.localId,
        kontikki_id: kontikki.id,
      })
      .select('id')
      .single();

    if (batchError) {
      if (batchError.code === '23505') {
        throw new ConflictException(
          `Batch "${batch.batch_name}" already exists in cloud storage`,
        );
      }
      throw new Error(`kiln_batches insert failed: ${batchError.message}`);
    }

    const batchId = insertedBatch.id as string;
    const readingRows = batch.data_points.map((point) => ({
      batch_id: batchId,
      time_offset_seconds: point.time_offset_seconds,
      temperature: point.temperature,
      recorded_at: new Date(
        startTime.getTime() + point.time_offset_seconds * 1000,
      ).toISOString(),
    }));

    const chunkSize = 500;
    for (let offset = 0; offset < readingRows.length; offset += chunkSize) {
      const chunk = readingRows.slice(offset, offset + chunkSize);
      const { error: readingsError } = await this.supabase
        .from('kiln_temperature_readings')
        .insert(chunk);

      if (readingsError) {
        await this.supabase.from('kiln_batches').delete().eq('id', batchId);
        throw new Error(
          `kiln_temperature_readings insert failed at offset ${offset}: ${readingsError.message}`,
        );
      }
    }

    return {
      id: batchId,
      batchName: batch.batch_name,
      dataPointCount: readingRows.length,
      alreadySynced: false,
    };
  }

  async listBatches(user: AuthenticatedUser) {
    let query = this.supabase
      .from('kiln_batches')
      .select(
        `
        id,
        batch_name,
        kiln_id,
        kontikki_id,
        latitude,
        longitude,
        start_time_utc,
        duration_seconds,
        ended_at,
        source_filename,
        created_at,
        kontikkis (
          kontikki_code
        )
      `,
      )
      .order('created_at', { ascending: false });

    if (!canAccessNetwork(user.role)) {
      query = query.eq('uploaded_by', user.id);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list kiln batches: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapBatchSummary(row));
  }

  async getBatchWithReadings(user: AuthenticatedUser, batchId: string) {
    const { data: batch, error: batchError } = await this.supabase
      .from('kiln_batches')
      .select(
        `
        id,
        batch_name,
        kiln_id,
        kontikki_id,
        latitude,
        longitude,
        start_time_utc,
        duration_seconds,
        ended_at,
        source_filename,
        uploaded_by,
        created_at,
        kontikkis (
          kontikki_code
        )
      `,
      )
      .eq('id', batchId)
      .maybeSingle();

    if (batchError) {
      throw new Error(`Failed to load kiln batch: ${batchError.message}`);
    }

    if (!batch) {
      throw new NotFoundException('Kiln batch not found');
    }

    if (!canAccessNetwork(user.role) && batch.uploaded_by !== user.id) {
      throw new ForbiddenException('You do not have access to this batch.');
    }

    const { data: readings, error: readingsError } = await this.supabase
      .from('kiln_temperature_readings')
      .select('time_offset_seconds, temperature, recorded_at')
      .eq('batch_id', batchId)
      .order('time_offset_seconds', { ascending: true });

    if (readingsError) {
      throw new Error(
        `Failed to load temperature readings: ${readingsError.message}`,
      );
    }

    return {
      ...this.mapBatchSummary(batch),
      readings: readings ?? [],
    };
  }

  private mapBatchSummary(row: Record<string, unknown>) {
    const kontikki = row.kontikkis;
    const kontikkiCode = Array.isArray(kontikki)
      ? (kontikki[0] as { kontikki_code?: string } | undefined)?.kontikki_code
      : (kontikki as { kontikki_code?: string } | null)?.kontikki_code;

    return {
      id: row.id as string,
      batch_name: row.batch_name as string,
      kiln_id: row.kiln_id as string,
      kontikki_id: (row.kontikki_id as string | null) ?? null,
      kontikki_code: kontikkiCode ?? null,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      start_time_utc: row.start_time_utc as string,
      duration_seconds: row.duration_seconds as number,
      ended_at: row.ended_at as string,
      source_filename: row.source_filename as string,
      created_at: row.created_at as string,
    };
  }

  private async resolveAuthorizedKontikki(user: AuthenticatedUser, kontikkiId: string) {
    if (!kontikkiId?.trim()) {
      throw new ForbiddenException('kontikkiId is required.');
    }

    const overview = await this.mobileNetwork.getOverview(user);
    const kontikki = overview.kontikkis.find((row) => row.id === kontikkiId);

    if (!kontikki) {
      throw new ForbiddenException('You do not have access to this kontikki.');
    }

    if (kontikki.status !== 'active') {
      throw new ForbiddenException('This kontikki is not active.');
    }

    return kontikki;
  }
}
