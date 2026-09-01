import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessWebPortal,
  canReviewPyrolysisBatches,
  isPyrolysisBatchStatusPhotoKey,
  isPyrolysisBatchStatusSectionKey,
  type MixingEntryReviewStatus,
  type MixingMaterialType,
  type PyrolysisBatchMixingEntrySummary,
  type PyrolysisBatchRecord,
  type PyrolysisBatchStatusFlag,
  type PyrolysisBatchStatusRecord,
  type PyrolysisBatchStatusValue,
  type PyrolysisSessionStatus,
  type SubmitPyrolysisBatchStatusPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface PyrolysisBatchListItem {
  id: string;
  batch_number?: string | null;
  kontikki_id: string;
  kontikki_code: string;
  session_id: string;
  session_status: PyrolysisSessionStatus;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
  yield_percent?: number | null;
  pyrolysis_completed: boolean;
  review_status: PyrolysisBatchStatusValue;
  reviewed_at?: string | null;
  feedstock_name?: string | null;
  feedstock_id?: string | null;
  feedstock_quantity?: number | null;
  avg_feedstock_size_cm?: number | null;
  sample_id?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  comment?: string | null;
  reviewer_notes?: string | null;
  review_flag_text?: string[];
  moisture_readings?: (number | null)[];
  created_at?: string;
  updated_at?: string;
}

export interface PyrolysisBatchDetail extends PyrolysisBatchRecord {
  session_status: PyrolysisSessionStatus;
  session_completed_at?: string | null;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
  batch_status: PyrolysisBatchStatusRecord | null;
  mixing_entries: PyrolysisBatchMixingEntrySummary[];
}

const BATCH_LIST_SELECT = `
  id,
  batch_number,
  kontikki_id,
  kontikki_code,
  session_id,
  yield_percent,
  pyrolysis_completed,
  feedstock_name,
  feedstock_id,
  feedstock_quantity,
  avg_feedstock_size_cm,
  sample_id,
  location_lat,
  location_lng,
  location_address,
  comment,
  moisture_reading_1,
  moisture_reading_2,
  moisture_reading_3,
  moisture_reading_4,
  moisture_reading_5,
  created_at,
  updated_at,
  pyrolysis_sessions!inner (
    id,
    status,
    operator_id,
    users:operator_id (
      id,
      full_name
    )
  ),
  kontikkis (
    id,
    biochar_producer_id,
    biochar_producer:biochar_producers (
      id,
      name
    )
  ),
  pyrolysis_batch_status (
    id,
    status,
    reviewed_at,
    reviewer_notes,
    pyrolysis_batch_status_flags (
      target_type,
      target_key,
      notes
    )
  )
`;

const BATCH_DETAIL_SELECT = `
  *,
  pyrolysis_sessions!inner (
    id,
    status,
    completed_at,
    operator_id,
    users:operator_id (
      id,
      full_name
    )
  ),
  kontikkis (
    id,
    biochar_producer_id,
    biochar_producer:biochar_producers (
      id,
      name
    )
  ),
  pyrolysis_batch_status (
    id,
    batch_id,
    status,
    reviewer_notes,
    reviewed_by,
    reviewed_at,
    created_at,
    updated_at,
    reviewer:reviewed_by (
      id,
      full_name
    ),
    pyrolysis_batch_status_flags (
      id,
      target_type,
      target_key,
      status,
      notes
    )
  )
`;

const MIXING_FOR_BATCH_SELECT = `
  id,
  started_at,
  farm_id,
  farm_name,
  material_type,
  material_to_biochar_ratio,
  users:operator_id (
    id,
    full_name
  ),
  mixing_entry_status (
    status
  ),
  mixing_pyrolysis_links!inner (
    pyrolysis_batch_id
  )
`;

@Injectable()
export class PyrolysisBatchesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async list(user: AuthenticatedUser): Promise<PyrolysisBatchListItem[]> {
    this.assertPortalAccess(user);

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(BATCH_LIST_SELECT)
      .order('updated_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.mapListItem(row));
  }

  async findById(user: AuthenticatedUser, id: string): Promise<PyrolysisBatchDetail> {
    this.assertPortalAccess(user);

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(BATCH_DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pyrolysis batch not found.');

    const mixing_entries = await this.fetchMixingEntriesForBatch(id);

    return {
      ...this.mapDetail(data),
      mixing_entries,
    };
  }

  async submitBatchStatus(
    user: AuthenticatedUser,
    batchId: string,
    payload: SubmitPyrolysisBatchStatusPayload,
  ): Promise<PyrolysisBatchDetail> {
    this.assertCanReview(user);
    await this.findById(user, batchId);
    this.validateBatchStatusPayload(payload);

    const now = new Date().toISOString();

    const { data: batchStatus, error: statusError } = await this.supabase
      .from('pyrolysis_batch_status')
      .upsert(
        {
          batch_id: batchId,
          status: payload.status,
          reviewer_notes: payload.reviewer_notes ?? null,
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        },
        { onConflict: 'batch_id' },
      )
      .select('id')
      .single();

    if (statusError) throw new BadRequestException(statusError.message);

    const batchStatusId = batchStatus.id as string;

    const { error: deleteError } = await this.supabase
      .from('pyrolysis_batch_status_flags')
      .delete()
      .eq('batch_status_id', batchStatusId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    if (payload.flags.length > 0) {
      const flagRows = payload.flags.map((flag) => ({
        batch_status_id: batchStatusId,
        target_type: flag.target_type,
        target_key: flag.target_key,
        status: flag.status,
        notes: flag.notes ?? null,
      }));

      const { error: insertError } = await this.supabase
        .from('pyrolysis_batch_status_flags')
        .insert(flagRows);

      if (insertError) throw new BadRequestException(insertError.message);
    }

    return this.findById(user, batchId);
  }

  async updateYield(
    user: AuthenticatedUser,
    batchId: string,
    yieldPercent: number,
  ): Promise<PyrolysisBatchDetail> {
    this.assertPortalAccess(user);
    await this.findById(user, batchId);

    const value = typeof yieldPercent === 'number' ? yieldPercent : Number(yieldPercent);
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Yield percent must be a number.');
    }
    if (value < 0 || value > 100) {
      throw new BadRequestException('Yield percent must be between 0 and 100.');
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('pyrolysis_batches')
      .update({
        yield_percent: value,
        yield_saved_at: now,
        updated_at: now,
      })
      .eq('id', batchId);

    if (error) throw new BadRequestException(error.message);

    return this.findById(user, batchId);
  }

  private validateBatchStatusPayload(payload: SubmitPyrolysisBatchStatusPayload) {
    if (!payload.status) {
      throw new BadRequestException('Batch status is required.');
    }

    for (const flag of payload.flags ?? []) {
      if (flag.target_type === 'section' && !isPyrolysisBatchStatusSectionKey(flag.target_key)) {
        throw new BadRequestException(`Invalid section key: ${flag.target_key}`);
      }
      if (flag.target_type === 'photo' && !isPyrolysisBatchStatusPhotoKey(flag.target_key)) {
        throw new BadRequestException(`Invalid photo key: ${flag.target_key}`);
      }
    }
  }

  private mapListItem(row: Record<string, unknown>): PyrolysisBatchListItem {
    const session = this.unwrap(row.pyrolysis_sessions);
    const operator = this.unwrap(session?.users);
    const kontikki = this.unwrap(row.kontikkis);
    const producer = this.unwrap(kontikki?.biochar_producer);
    const batchStatus = this.unwrap(row.pyrolysis_batch_status);
    const flags = this.unwrapArray(batchStatus?.pyrolysis_batch_status_flags);
    const numeric = (value: unknown) => (value != null ? Number(value) : null);

    return {
      id: row.id as string,
      batch_number: (row.batch_number as string) ?? null,
      kontikki_id: row.kontikki_id as string,
      kontikki_code: row.kontikki_code as string,
      session_id: row.session_id as string,
      session_status: session?.status as PyrolysisSessionStatus,
      operator_id: session?.operator_id as string,
      operator_name: (operator?.full_name as string) ?? '—',
      producer_id: (kontikki?.biochar_producer_id as string) ?? null,
      producer_name: (producer?.name as string) ?? '—',
      yield_percent: row.yield_percent != null ? Number(row.yield_percent) : null,
      pyrolysis_completed: Boolean(row.pyrolysis_completed),
      review_status: (batchStatus?.status as PyrolysisBatchStatusValue) ?? 'pending',
      reviewed_at: (batchStatus?.reviewed_at as string) ?? null,
      feedstock_name: (row.feedstock_name as string) ?? null,
      feedstock_id: (row.feedstock_id as string) ?? null,
      feedstock_quantity: numeric(row.feedstock_quantity),
      avg_feedstock_size_cm: numeric(row.avg_feedstock_size_cm),
      sample_id: (row.sample_id as string) ?? null,
      location_lat: numeric(row.location_lat),
      location_lng: numeric(row.location_lng),
      location_address: (row.location_address as string) ?? null,
      comment: (row.comment as string) ?? null,
      reviewer_notes: (batchStatus?.reviewer_notes as string) ?? null,
      review_flag_text: flags.flatMap((flag) =>
        [flag.target_type, flag.target_key, flag.notes].filter(Boolean).map(String),
      ),
      moisture_readings: [1, 2, 3, 4, 5].map((index) =>
        numeric(row[`moisture_reading_${index}`]),
      ),
      created_at: row.created_at as string | undefined,
      updated_at: row.updated_at as string | undefined,
    };
  }

  private mapDetail(row: Record<string, unknown>): Omit<PyrolysisBatchDetail, 'mixing_entries'> {
    const session = this.unwrap(row.pyrolysis_sessions);
    const operator = this.unwrap(session?.users);
    const kontikki = this.unwrap(row.kontikkis);
    const producer = this.unwrap(kontikki?.biochar_producer);
    const batchStatusRow = this.unwrap(row.pyrolysis_batch_status);
    const flags = this.unwrapArray(batchStatusRow?.pyrolysis_batch_status_flags);

    const batch = this.mapBatch(row);
    const batch_status: PyrolysisBatchStatusRecord | null = batchStatusRow
      ? {
          id: batchStatusRow.id as string,
          batch_id: batchStatusRow.batch_id as string,
          status: batchStatusRow.status as PyrolysisBatchStatusValue,
          reviewer_notes: (batchStatusRow.reviewer_notes as string) ?? null,
          reviewed_by: (batchStatusRow.reviewed_by as string) ?? null,
          reviewed_at: (batchStatusRow.reviewed_at as string) ?? null,
          created_at: batchStatusRow.created_at as string | undefined,
          updated_at: batchStatusRow.updated_at as string | undefined,
          reviewer: this.unwrap(batchStatusRow.reviewer) as PyrolysisBatchStatusRecord['reviewer'],
          flags: flags.map(
            (flag): PyrolysisBatchStatusFlag => ({
              id: flag.id as string,
              target_type: flag.target_type as PyrolysisBatchStatusFlag['target_type'],
              target_key: flag.target_key as string,
              status: flag.status as PyrolysisBatchStatusFlag['status'],
              notes: (flag.notes as string) ?? null,
            }),
          ),
        }
      : null;

    return {
      ...batch,
      session_status: session?.status as PyrolysisSessionStatus,
      session_completed_at: (session?.completed_at as string) ?? null,
      operator_id: session?.operator_id as string,
      operator_name: (operator?.full_name as string) ?? '—',
      producer_id: (kontikki?.biochar_producer_id as string) ?? null,
      producer_name: (producer?.name as string) ?? '—',
      batch_status,
    };
  }

  private mapBatch(row: Record<string, unknown>): PyrolysisBatchRecord {
    const numeric = (value: unknown) => (value != null ? Number(value) : null);

    return {
      id: row.id as string,
      session_id: row.session_id as string,
      kontikki_id: row.kontikki_id as string,
      kontikki_code: row.kontikki_code as string,
      submission_status: ((row.submission_status as string) ?? 'draft') as PyrolysisBatchRecord['submission_status'],
      batch_number: (row.batch_number as string) ?? null,
      feedstock_quantity: numeric(row.feedstock_quantity),
      avg_feedstock_size_cm: numeric(row.avg_feedstock_size_cm),
      feedstock_id: (row.feedstock_id as string) ?? null,
      feedstock_name: (row.feedstock_name as string) ?? null,
      location_lat: numeric(row.location_lat),
      location_lng: numeric(row.location_lng),
      location_address: (row.location_address as string) ?? null,
      feedstock_photo_url: (row.feedstock_photo_url as string) ?? null,
      feedstock_size_photo_url: (row.feedstock_size_photo_url as string) ?? null,
      feedstock_photo_metadata:
        (row.feedstock_photo_metadata as PyrolysisBatchRecord['feedstock_photo_metadata']) ??
        null,
      feedstock_size_photo_metadata:
        (row.feedstock_size_photo_metadata as PyrolysisBatchRecord['feedstock_size_photo_metadata']) ??
        null,
      moisture_reading_1: numeric(row.moisture_reading_1),
      moisture_reading_2: numeric(row.moisture_reading_2),
      moisture_reading_3: numeric(row.moisture_reading_3),
      moisture_reading_4: numeric(row.moisture_reading_4),
      moisture_reading_5: numeric(row.moisture_reading_5),
      moisture_photo_url_1: (row.moisture_photo_url_1 as string) ?? null,
      moisture_photo_url_2: (row.moisture_photo_url_2 as string) ?? null,
      moisture_photo_url_3: (row.moisture_photo_url_3 as string) ?? null,
      moisture_photo_url_4: (row.moisture_photo_url_4 as string) ?? null,
      moisture_photo_url_5: (row.moisture_photo_url_5 as string) ?? null,
      moisture_photo_metadata_1:
        (row.moisture_photo_metadata_1 as PyrolysisBatchRecord['moisture_photo_metadata_1']) ??
        null,
      moisture_photo_metadata_2:
        (row.moisture_photo_metadata_2 as PyrolysisBatchRecord['moisture_photo_metadata_2']) ??
        null,
      moisture_photo_metadata_3:
        (row.moisture_photo_metadata_3 as PyrolysisBatchRecord['moisture_photo_metadata_3']) ??
        null,
      moisture_photo_metadata_4:
        (row.moisture_photo_metadata_4 as PyrolysisBatchRecord['moisture_photo_metadata_4']) ??
        null,
      moisture_photo_metadata_5:
        (row.moisture_photo_metadata_5 as PyrolysisBatchRecord['moisture_photo_metadata_5']) ??
        null,
      stage_initial_photo_url: (row.stage_initial_photo_url as string) ?? null,
      stage_middle_photo_url: (row.stage_middle_photo_url as string) ?? null,
      stage_final_photo_url: (row.stage_final_photo_url as string) ?? null,
      stage_quenching_photo_url: (row.stage_quenching_photo_url as string) ?? null,
      stage_initial_captured_at: (row.stage_initial_captured_at as string) ?? null,
      stage_middle_captured_at: (row.stage_middle_captured_at as string) ?? null,
      stage_final_captured_at: (row.stage_final_captured_at as string) ?? null,
      stage_quenching_captured_at: (row.stage_quenching_captured_at as string) ?? null,
      stage_initial_saved_at: (row.stage_initial_saved_at as string) ?? null,
      stage_middle_saved_at: (row.stage_middle_saved_at as string) ?? null,
      stage_final_saved_at: (row.stage_final_saved_at as string) ?? null,
      stage_quenching_saved_at: (row.stage_quenching_saved_at as string) ?? null,
      stage_initial_photo_metadata:
        (row.stage_initial_photo_metadata as PyrolysisBatchRecord['stage_initial_photo_metadata']) ??
        null,
      stage_middle_photo_metadata:
        (row.stage_middle_photo_metadata as PyrolysisBatchRecord['stage_middle_photo_metadata']) ??
        null,
      stage_final_photo_metadata:
        (row.stage_final_photo_metadata as PyrolysisBatchRecord['stage_final_photo_metadata']) ??
        null,
      stage_quenching_photo_metadata:
        (row.stage_quenching_photo_metadata as PyrolysisBatchRecord['stage_quenching_photo_metadata']) ??
        null,
      yield_percent: numeric(row.yield_percent),
      comment: (row.comment as string) ?? null,
      sample_id: (row.sample_id as string) ?? null,
      sample_photo_url: (row.sample_photo_url as string) ?? null,
      sample_photo_metadata:
        (row.sample_photo_metadata as PyrolysisBatchRecord['sample_photo_metadata']) ??
        null,
      sample_saved_at: (row.sample_saved_at as string) ?? null,
      info_completed: Boolean(row.info_completed),
      moisture_completed: Boolean(row.moisture_completed),
      pyrolysis_completed: Boolean(row.pyrolysis_completed),
      info_saved_at: (row.info_saved_at as string) ?? null,
      moisture_saved_at: (row.moisture_saved_at as string) ?? null,
      pyrolysis_saved_at: (row.pyrolysis_saved_at as string) ?? null,
      yield_saved_at: (row.yield_saved_at as string) ?? null,
      created_at: row.created_at as string | undefined,
      updated_at: row.updated_at as string | undefined,
    };
  }

  private async fetchMixingEntriesForBatch(
    batchId: string,
  ): Promise<PyrolysisBatchMixingEntrySummary[]> {
    const { data, error } = await this.supabase
      .from('mixing_entries')
      .select(MIXING_FOR_BATCH_SELECT)
      .eq('mixing_pyrolysis_links.pyrolysis_batch_id', batchId)
      .order('started_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.mapMixingEntrySummary(row));
  }

  private mapMixingEntrySummary(row: Record<string, unknown>): PyrolysisBatchMixingEntrySummary {
    const operator = this.unwrap(row.users);
    const entryStatus = this.unwrap(row.mixing_entry_status);

    return {
      id: row.id as string,
      started_at: row.started_at as string,
      farm_id: (row.farm_id as string) ?? null,
      farm_name: (row.farm_name as string) ?? null,
      material_type: (row.material_type as MixingMaterialType) ?? null,
      material_to_biochar_ratio:
        row.material_to_biochar_ratio != null
          ? Number(row.material_to_biochar_ratio)
          : null,
      operator_name: (operator?.full_name as string)?.trim() || '—',
      review_status:
        (entryStatus?.status as MixingEntryReviewStatus) ?? 'pending_review',
    };
  }

  private unwrap<T extends Record<string, unknown>>(value: unknown): T | null {
    if (!value) return null;
    if (Array.isArray(value)) return (value[0] as T) ?? null;
    return value as T;
  }

  private unwrapArray<T extends Record<string, unknown>>(value: unknown): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as T[];
    return [value as T];
  }

  private assertPortalAccess(user: AuthenticatedUser) {
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to view pyrolysis batches.');
    }
  }

  private assertCanReview(user: AuthenticatedUser) {
    if (!canReviewPyrolysisBatches(user.role)) {
      throw new ForbiddenException('Not allowed to review pyrolysis batches.');
    }
  }
}
