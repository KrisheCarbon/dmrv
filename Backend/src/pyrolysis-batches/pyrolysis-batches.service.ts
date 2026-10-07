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
  isRainbowMoistureComplete,
  quenchDurationSeconds,
  rainbowMoistureMeanLimit,
  rainbowRequiredMoistureCount,
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
  generated_batch_code?: string | null;
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

export interface PyrolysisSensorReading {
  time_offset_seconds: number;
  temperature: number;
  recorded_at: string;
  top_c: number | null;
  middle_c: number | null;
  bottom_c: number | null;
}

export interface PyrolysisSensorLog {
  id: string;
  batch_name: string;
  kiln_id: string;
  started_at: string;
  ended_at: string;
  /** sensor = GPS clock on the node. phone = arrival time on the handset. */
  clock: 'sensor' | 'phone';
  point_count: number;
  lowest_c: number | null;
  /** True when the first and last tenth of the window were left out of the 350°C check. */
  ends_excluded: boolean;
  stayed_at_or_above_350: boolean | null;
  readings: PyrolysisSensorReading[];
}

export interface RainbowMoistureProof {
  slot: number;
  reading: number | null;
  photo_url: string | null;
  captured_at: string | null;
}

export interface RainbowLayerProof {
  sequence: number;
  photo_url: string | null;
  captured_at: string | null;
}

export interface RainbowRunProof {
  feedstock_class: 'woody' | 'other' | null;
  required_moisture_count: number;
  moisture_mean: number | null;
  moisture_mean_limit: number | null;
  highest_moisture: number | null;
  moisture_within_rules: boolean;
  moisture: RainbowMoistureProof[];
  layers: RainbowLayerProof[];
  last_layer_confirmed: boolean;
  flame_curtain_photo_url: string | null;
  flame_curtain_captured_at: string | null;
  quench_start_photo_url: string | null;
  quench_start_captured_at: string | null;
  quench_end_photo_url: string | null;
  quench_end_captured_at: string | null;
  quench_photos: Array<{
    slot: number;
    photo_url: string | null;
    captured_at: string | null;
  }>;
  quench_duration_seconds: number | null;
  quench_video_url: string | null;
  quench_video_captured_at: string | null;
  quench_video_duration_seconds: number | null;
}

export interface PyrolysisBatchDetail extends PyrolysisBatchRecord {
  session_status: PyrolysisSessionStatus;
  session_completed_at?: string | null;
  operator_id: string;
  operator_name: string;
  producer_id?: string | null;
  producer_name: string;
  protocol: 'csi' | 'rainbow';
  kiln_photo_url?: string | null;
  sensor_logs: PyrolysisSensorLog[];
  run_proof: RainbowRunProof | null;
  volume_percent?: number | null;
  kontikki_capacity_liters?: number | null;
  biochar_bulk_density_kg_m3?: number | null;
  estimated_biochar_volume_liters?: number | null;
  estimated_biochar_mass_kg?: number | null;
  sample_spots?: Array<{
    spot: number;
    photo_url?: string | null;
    photo_metadata?: { captured_at?: string | null } | null;
  }>;
  sample_pile_photo_url?: string | null;
  sample_bag_code?: string | null;
  sample_bag_photo_url?: string | null;
  sample_bag_not_used?: boolean;
  sample_collected_at?: string | null;
  batch_status: PyrolysisBatchStatusRecord | null;
  mixing_entries: PyrolysisBatchMixingEntrySummary[];
}

const BATCH_LIST_SELECT = `
  id,
  batch_number,
  generated_batch_code,
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
  csi_pyrolysis_sessions!inner (
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
  csi_pyrolysis_batch_status (
    id,
    status,
    reviewed_at,
    reviewer_notes,
    csi_pyrolysis_batch_status_flags (
      target_type,
      target_key,
      notes
    )
  )
`;

const BATCH_DETAIL_SELECT = `
  *,
  csi_pyrolysis_sessions!inner (
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
  csi_pyrolysis_batch_status (
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
    csi_pyrolysis_batch_status_flags (
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
  csi_mixing_entry_status (
    status
  ),
  csi_mixing_pyrolysis_links!inner (
    pyrolysis_batch_id
  )
`;

@Injectable()
export class PyrolysisBatchesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async list(user: AuthenticatedUser): Promise<PyrolysisBatchListItem[]> {
    this.assertPortalAccess(user);

    const { data, error } = await this.supabase
      .from('csi_pyrolysis_batches')
      .select(BATCH_LIST_SELECT)
      .order('updated_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    const csi = (data ?? []).map((row) => this.mapListItem(row));
    const rainbow = await this.listRainbow();
    return [...csi, ...rainbow].sort((a, b) =>
      String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
    );
  }

  async findById(user: AuthenticatedUser, id: string): Promise<PyrolysisBatchDetail> {
    this.assertPortalAccess(user);

    const { data, error } = await this.supabase
      .from('csi_pyrolysis_batches')
      .select(BATCH_DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (data) {
      const mixing_entries = await this.fetchMixingEntriesForBatch(id);
      const sensor_logs = await this.sensorLogsForPyrolysis(data.kontikki_id as string, data);
      return {
        ...this.mapDetail(data),
        protocol: 'csi',
        kiln_photo_url: null,
        sensor_logs,
        run_proof: null,
        mixing_entries,
      };
    }

    return this.findRainbowById(id);
  }

  async submitBatchStatus(
    user: AuthenticatedUser,
    batchId: string,
    payload: SubmitPyrolysisBatchStatusPayload,
  ): Promise<PyrolysisBatchDetail> {
    this.assertCanReview(user);
    const existing = await this.findById(user, batchId);
    if (existing.protocol === 'rainbow') {
      throw new BadRequestException(
        'Rainbow kiln photos are evidence on the batch. This review form is for CSI batches.',
      );
    }
    this.validateBatchStatusPayload(payload);

    const now = new Date().toISOString();

    const { data: batchStatus, error: statusError } = await this.supabase
      .from('csi_pyrolysis_batch_status')
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
      .from('csi_pyrolysis_batch_status_flags')
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
        .from('csi_pyrolysis_batch_status_flags')
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
    const existing = await this.findById(user, batchId);
    if (existing.protocol === 'rainbow') {
      throw new BadRequestException('Rainbow yield is recorded on the kiln run and is not edited here.');
    }

    const value = typeof yieldPercent === 'number' ? yieldPercent : Number(yieldPercent);
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Yield percent must be a number.');
    }
    if (value < 0 || value > 100) {
      throw new BadRequestException('Yield percent must be between 0 and 100.');
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('csi_pyrolysis_batches')
      .update({
        yield_percent: value,
        yield_saved_at: now,
        updated_at: now,
      })
      .eq('id', batchId);

    if (error) throw new BadRequestException(error.message);

    return this.findById(user, batchId);
  }

  async updateVolumePercent(
    user: AuthenticatedUser,
    batchId: string,
    volumePercent: number | null | undefined,
  ): Promise<PyrolysisBatchDetail> {
    this.assertPortalAccess(user);
    const existing = await this.findById(user, batchId);
    if (existing.protocol !== 'rainbow') {
      throw new BadRequestException('Volume percent is only recorded on a Rainbow kiln run.');
    }

    let value: number | null = null;
    if (volumePercent != null) {
      value = Number(volumePercent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new BadRequestException('Volume percent must be between 0 and 100.');
      }
    }

    const { error } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .update({
        volume_percent: value,
        updated_at: new Date().toISOString(),
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

  private async listRainbow(): Promise<PyrolysisBatchListItem[]> {
    const { data, error } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .select(`
        id,
        batch_number,
        generated_batch_code,
        kontikki_id,
        kontikki_code,
        session_id,
        yield_percent,
        production_completed,
        feedstock_name,
        feedstock_id,
        feedstock_quantity,
        avg_feedstock_size_cm,
        sample_id,
        location_lat,
        location_lng,
        location_address,
        comment,
        producer_name,
        created_at,
        updated_at,
        rainbow_pyrolysis_sessions!inner (
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
        )
      `)
      .eq('submission_status', 'submitted')
      .order('updated_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const session = this.unwrap(row.rainbow_pyrolysis_sessions);
      const operator = this.unwrap(session?.users);
      const kontikki = this.unwrap(row.kontikkis);
      const producer = this.unwrap(kontikki?.biochar_producer);
      const numeric = (value: unknown) => (value != null ? Number(value) : null);
      return {
        id: row.id as string,
        batch_number: (row.batch_number as string) ?? null,
        generated_batch_code: (row.generated_batch_code as string) ?? null,
        kontikki_id: row.kontikki_id as string,
        kontikki_code: row.kontikki_code as string,
        session_id: row.session_id as string,
        session_status: session?.status as PyrolysisSessionStatus,
        operator_id: session?.operator_id as string,
        operator_name: (operator?.full_name as string) ?? '—',
        producer_id: (kontikki?.biochar_producer_id as string) ?? null,
        producer_name:
          (producer?.name as string) ?? (row.producer_name as string) ?? '—',
        yield_percent: row.yield_percent != null ? Number(row.yield_percent) : null,
        pyrolysis_completed: Boolean(row.production_completed),
        review_status: 'pending' as PyrolysisBatchStatusValue,
        reviewed_at: null,
        feedstock_name: (row.feedstock_name as string) ?? null,
        feedstock_id: (row.feedstock_id as string) ?? null,
        feedstock_quantity: numeric(row.feedstock_quantity),
        avg_feedstock_size_cm: numeric(row.avg_feedstock_size_cm),
        sample_id: (row.sample_id as string) ?? null,
        location_lat: numeric(row.location_lat),
        location_lng: numeric(row.location_lng),
        location_address: (row.location_address as string) ?? null,
        comment: (row.comment as string) ?? null,
        reviewer_notes: null,
        review_flag_text: ['Rainbow'],
        moisture_readings: [],
        created_at: row.created_at as string | undefined,
        updated_at: row.updated_at as string | undefined,
      };
    });
  }

  private async findRainbowById(id: string): Promise<PyrolysisBatchDetail> {
    const { data, error } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .select(`
        *,
        rainbow_pyrolysis_sessions!inner (
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
          capacity,
          biochar_producer_id,
          biochar_producer:biochar_producers (
            id,
            name
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pyrolysis batch not found.');

    const session = this.unwrap(data.rainbow_pyrolysis_sessions);
    const operator = this.unwrap(session?.users);
    const kontikki = this.unwrap(data.kontikkis);
    const producer = this.unwrap(kontikki?.biochar_producer);
    const batch = this.mapBatch(data);
    const sensor_logs = await this.sensorLogsForPyrolysis(data.kontikki_id as string, data);
    const run_proof = await this.rainbowRunProof(id, data);
    const quantity = await this.rainbowQuantityEstimate(data, kontikki?.capacity);

    return {
      ...batch,
      sensor_logs,
      run_proof,
      ...quantity,
      session_status: session?.status as PyrolysisSessionStatus,
      session_completed_at: (session?.completed_at as string) ?? null,
      operator_id: session?.operator_id as string,
      operator_name: (operator?.full_name as string) ?? '—',
      producer_id: (kontikki?.biochar_producer_id as string) ?? (data.producer_id as string) ?? null,
      producer_name: (producer?.name as string) ?? (data.producer_name as string) ?? '—',
      protocol: 'rainbow',
      kiln_photo_url: (data.kiln_photo_url as string) ?? null,
      sample_spots: Array.isArray(data.sample_spots) ? data.sample_spots : [],
      sample_pile_photo_url: (data.sample_pile_photo_url as string) ?? null,
      sample_bag_code: (data.sample_bag_code as string) ?? null,
      sample_bag_photo_url: (data.sample_bag_photo_url as string) ?? null,
      sample_bag_not_used: Boolean(data.sample_bag_not_used),
      sample_collected_at: (data.sample_collected_at as string) ?? null,
      feedstock_photo_url: (data.feedstock_photo_url as string) ?? null,
      feedstock_size_photo_url: (data.feedstock_size_photo_url as string) ?? null,
      sample_photo_url: (data.sample_photo_url as string) ?? null,
      batch_status: null,
      mixing_entries: [],
    };
  }

  private mapListItem(row: Record<string, unknown>): PyrolysisBatchListItem {
    const session = this.unwrap(row.csi_pyrolysis_sessions);
    const operator = this.unwrap(session?.users);
    const kontikki = this.unwrap(row.kontikkis);
    const producer = this.unwrap(kontikki?.biochar_producer);
    const batchStatus = this.unwrap(row.csi_pyrolysis_batch_status);
    const flags = this.unwrapArray(batchStatus?.csi_pyrolysis_batch_status_flags);
    const numeric = (value: unknown) => (value != null ? Number(value) : null);

    return {
      id: row.id as string,
      batch_number: (row.batch_number as string) ?? null,
      generated_batch_code: (row.generated_batch_code as string) ?? null,
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
    const session = this.unwrap(row.csi_pyrolysis_sessions);
    const operator = this.unwrap(session?.users);
    const kontikki = this.unwrap(row.kontikkis);
    const producer = this.unwrap(kontikki?.biochar_producer);
    const batchStatusRow = this.unwrap(row.csi_pyrolysis_batch_status);
    const flags = this.unwrapArray(batchStatusRow?.csi_pyrolysis_batch_status_flags);

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
      protocol: 'csi',
      kiln_photo_url: null,
      sensor_logs: [],
      run_proof: null,
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
      generated_batch_code: (row.generated_batch_code as string) ?? null,
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
      .from('csi_mixing_entries')
      .select(MIXING_FOR_BATCH_SELECT)
      .eq('csi_mixing_pyrolysis_links.pyrolysis_batch_id', batchId)
      .order('started_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.mapMixingEntrySummary(row));
  }

  private mapMixingEntrySummary(row: Record<string, unknown>): PyrolysisBatchMixingEntrySummary {
    const operator = this.unwrap(row.users);
    const entryStatus = this.unwrap(row.csi_mixing_entry_status);

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

  private async rainbowQuantityEstimate(
    row: Record<string, unknown>,
    capacity: unknown,
  ): Promise<Pick<
    PyrolysisBatchDetail,
    | 'volume_percent'
    | 'kontikki_capacity_liters'
    | 'biochar_bulk_density_kg_m3'
    | 'estimated_biochar_volume_liters'
    | 'estimated_biochar_mass_kg'
  >> {
    const volumePercent = row.volume_percent != null ? Number(row.volume_percent) : null;
    const capacityLiters = capacity != null && Number.isFinite(Number(capacity)) ? Number(capacity) : null;
    let density: number | null = null;
    const feedstockId = row.feedstock_id as string | null;
    if (feedstockId) {
      const { data, error } = await this.supabase
        .from('feedstocks')
        .select('biochar_bulk_density_kg_m3')
        .eq('id', feedstockId)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (data?.biochar_bulk_density_kg_m3 != null) {
        density = Number(data.biochar_bulk_density_kg_m3);
      }
    }

    const volumeLiters =
      volumePercent != null && capacityLiters != null
        ? (capacityLiters * volumePercent) / 100
        : null;
    const massKg =
      volumeLiters != null && density != null ? volumeLiters * (density / 1000) : null;

    return {
      volume_percent: volumePercent != null && Number.isFinite(volumePercent) ? volumePercent : null,
      kontikki_capacity_liters: capacityLiters,
      biochar_bulk_density_kg_m3: density != null && Number.isFinite(density) ? density : null,
      estimated_biochar_volume_liters: volumeLiters,
      estimated_biochar_mass_kg: massKg,
    };
  }

  private async rainbowRunProof(
    batchId: string,
    row: Record<string, unknown>,
  ): Promise<RainbowRunProof> {
    const [{ data: moistureRows, error: moistureError }, { data: loadRows, error: loadError }] =
      await Promise.all([
        this.supabase
          .from('rainbow_pyrolysis_moisture')
          .select('slot, reading, photo_url, photo_metadata')
          .eq('batch_id', batchId)
          .order('slot', { ascending: true }),
        this.supabase
          .from('rainbow_pyrolysis_biomass_loads')
          .select('sequence, photo_url, captured_at, photo_metadata')
          .eq('batch_id', batchId)
          .order('sequence', { ascending: true }),
      ]);
    if (moistureError) throw new BadRequestException(moistureError.message);
    if (loadError) throw new BadRequestException(loadError.message);

    const feedstockClass = row.feedstock_class === 'woody' || row.feedstock_class === 'other'
      ? row.feedstock_class
      : null;
    const moisture = (moistureRows ?? []).map((item) => ({
      slot: Number(item.slot),
      reading: item.reading != null ? Number(item.reading) : null,
      photo_url: (item.photo_url as string) ?? null,
      captured_at: this.capturedAt(item.photo_metadata),
    }));
    const values = moisture
      .map((item) => item.reading)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    return {
      feedstock_class: feedstockClass,
      required_moisture_count: rainbowRequiredMoistureCount(
        row.feedstock_quantity != null ? Number(row.feedstock_quantity) : null,
      ),
      moisture_mean: mean,
      moisture_mean_limit: rainbowMoistureMeanLimit(feedstockClass),
      highest_moisture: values.length ? Math.max(...values) : null,
      moisture_within_rules: isRainbowMoistureComplete(
        moisture.map((item) => ({
          reading: item.reading,
          photo_url: item.photo_url,
        })),
        row.feedstock_quantity != null ? Number(row.feedstock_quantity) : null,
        feedstockClass,
      ),
      moisture,
      layers: (loadRows ?? []).map((item) => ({
        sequence: Number(item.sequence),
        photo_url: (item.photo_url as string) ?? null,
        captured_at: (item.captured_at as string) ?? this.capturedAt(item.photo_metadata),
      })),
      last_layer_confirmed: Boolean(row.last_layer_confirmed),
      flame_curtain_photo_url: (row.flame_curtain_photo_url as string) ?? null,
      flame_curtain_captured_at: this.capturedAt(row.flame_curtain_photo_metadata),
      quench_start_photo_url: (row.quench_start_photo_url as string) ?? null,
      quench_start_captured_at: this.capturedAt(row.quench_start_photo_metadata),
      quench_end_photo_url: (row.quench_end_photo_url as string) ?? null,
      quench_end_captured_at: this.capturedAt(row.quench_end_photo_metadata),
      ...this.quenchProofFromRow(row),
    };
  }

  private quenchProofFromRow(row: Record<string, unknown>): Pick<
    RainbowRunProof,
    | 'quench_photos'
    | 'quench_duration_seconds'
    | 'quench_video_url'
    | 'quench_video_captured_at'
    | 'quench_video_duration_seconds'
  > {
    const stored = Array.isArray(row.quench_photos) ? row.quench_photos : [];
    const fromStored = stored
      .map((item, index) => {
        const photo = item as Record<string, unknown>;
        return {
          slot: index + 1,
          photo_url: (photo.photo_url as string) ?? null,
          captured_at: this.capturedAt(photo.photo_metadata),
        };
      })
      .filter((photo) => photo.photo_url || photo.captured_at);
    const quenchPhotos = fromStored.length
      ? fromStored
      : [
          {
            slot: 1,
            photo_url: (row.quench_start_photo_url as string) ?? null,
            captured_at: this.capturedAt(row.quench_start_photo_metadata),
          },
          {
            slot: 2,
            photo_url: (row.quench_end_photo_url as string) ?? null,
            captured_at: this.capturedAt(row.quench_end_photo_metadata),
          },
        ].filter((photo) => photo.photo_url || photo.captured_at);
    const duration = quenchDurationSeconds(
      quenchPhotos.map((photo) => ({
        photo_metadata: photo.captured_at ? { captured_at: photo.captured_at } : null,
      })),
    );
    const videoSeconds = row.quench_video_duration_seconds;
    return {
      quench_photos: quenchPhotos,
      quench_duration_seconds: duration,
      quench_video_url: (row.quench_video_url as string) ?? null,
      quench_video_captured_at: this.capturedAt(row.quench_video_metadata),
      quench_video_duration_seconds:
        videoSeconds != null && Number.isFinite(Number(videoSeconds)) ? Number(videoSeconds) : null,
    };
  }

  private capturedAt(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const value = (metadata as { captured_at?: unknown }).captured_at;
    return typeof value === 'string' ? value : null;
  }

  /**
   * A sensor log belongs to a pyrolysis run when it is the same kontikki
   * (or the same hardware module) and its clock overlaps the run.
   * The node's GPS epoch is used when the packet carried one. Otherwise
   * the match uses the phone time stored as start_time_utc.
   */
  private async sensorLogsForPyrolysis(
    kontikkiId: string,
    row: Record<string, unknown>,
  ): Promise<PyrolysisSensorLog[]> {
    const window = this.pyrolysisTimeWindow(row);
    if (!window) return [];

    const marginMs = 2 * 60 * 60 * 1000;
    const searchStart = new Date(window.startMs - 12 * 60 * 60 * 1000).toISOString();
    const searchEnd = new Date(window.endMs + 12 * 60 * 60 * 1000).toISOString();

    const { data: moduleRow } = await this.supabase
      .from('kontikkis')
      .select('module_id')
      .eq('id', kontikkiId)
      .maybeSingle();
    const moduleId = (moduleRow?.module_id as string | null)?.trim() || null;

    const { data: byKontikki, error: kontikkiError } = await this.supabase
      .from('kiln_batches')
      .select('id, batch_name, kiln_id, kontikki_id, start_time_utc, ended_at, duration_seconds')
      .eq('kontikki_id', kontikkiId)
      .lte('start_time_utc', searchEnd)
      .or(`ended_at.gte."${searchStart}",ended_at.is.null`);

    if (kontikkiError) throw new BadRequestException(kontikkiError.message);

    let byModule: typeof byKontikki = [];
    if (moduleId) {
      const { data, error } = await this.supabase
        .from('kiln_batches')
        .select('id, batch_name, kiln_id, kontikki_id, start_time_utc, ended_at, duration_seconds')
        .eq('kiln_id', moduleId)
        .is('kontikki_id', null)
        .lte('start_time_utc', searchEnd)
        .or(`ended_at.gte."${searchStart}",ended_at.is.null`);
      if (error) throw new BadRequestException(error.message);
      byModule = data ?? [];
    }

    const candidates = new Map<string, Record<string, unknown>>();
    for (const item of [...(byKontikki ?? []), ...byModule]) {
      candidates.set(item.id as string, item);
    }

    const logs: PyrolysisSensorLog[] = [];
    for (const candidate of candidates.values()) {
      const log = await this.sensorLogIfOverlaps(candidate, window, marginMs);
      if (log) logs.push(log);
    }

    return logs.sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  private pyrolysisTimeWindow(row: Record<string, unknown>): { startMs: number; endMs: number } | null {
    const stamps = [
      'created_at',
      'updated_at',
      'info_saved_at',
      'moisture_saved_at',
      'production_saved_at',
      'pyrolysis_saved_at',
      'yield_saved_at',
      'sample_saved_at',
    ]
      .map((key) => Date.parse(String(row[key] ?? '')))
      .filter((value) => Number.isFinite(value));
    if (!stamps.length) return null;
    return { startMs: Math.min(...stamps), endMs: Math.max(...stamps) };
  }

  private async sensorLogIfOverlaps(
    candidate: Record<string, unknown>,
    window: { startMs: number; endMs: number },
    marginMs: number,
  ): Promise<PyrolysisSensorLog | null> {
    const { data, error } = await this.supabase
      .from('kiln_temperature_readings')
      .select('time_offset_seconds, temperature, recorded_at, top_c, middle_c, bottom_c, utc_epoch')
      .eq('batch_id', candidate.id as string)
      .order('time_offset_seconds', { ascending: true });
    if (error) throw new BadRequestException(error.message);

    const readings = (data ?? []) as Array<Record<string, unknown>>;
    const sensorTimes = readings
      .map((reading) => this.epochMs(reading.utc_epoch))
      .filter((value): value is number => value != null);
    const phoneStart = Date.parse(String(candidate.start_time_utc ?? ''));
    const phoneEndedAt = Date.parse(String(candidate.ended_at ?? ''));
    const durationMs = (Number(candidate.duration_seconds) || 0) * 1000;
    const phoneEnd = Number.isFinite(phoneEndedAt)
      ? phoneEndedAt
      : Number.isFinite(phoneStart) ? phoneStart + durationMs : NaN;
    const useSensorClock = sensorTimes.length >= 2;
    const logStart = useSensorClock ? Math.min(...sensorTimes) : phoneStart;
    const logEnd = useSensorClock ? Math.max(...sensorTimes) : phoneEnd;
    if (!Number.isFinite(logStart) || !Number.isFinite(logEnd)) return null;
    const overlapsMargin = logStart <= window.endMs + marginMs && logEnd >= window.startMs - marginMs;
    const overlapsWindow = logStart <= window.endMs && logEnd >= window.startMs;
    if (!overlapsMargin) return null;

    const clipStart = window.startMs - 15 * 60 * 1000;
    const clipEnd = window.endMs + 15 * 60 * 1000;
    const clipped = readings.filter((reading) => {
      const pointMs = useSensorClock
        ? this.epochMs(reading.utc_epoch) ?? Date.parse(String(reading.recorded_at ?? ''))
        : Date.parse(String(reading.recorded_at ?? ''));
      return Number.isFinite(pointMs) && pointMs >= clipStart && pointMs <= clipEnd;
    });
    const series = clipped.length > 0 ? clipped : overlapsWindow ? readings : [];
    if (!series.length) return null;

    const firstMs = useSensorClock
      ? this.epochMs(series[0].utc_epoch) ?? Date.parse(String(series[0].recorded_at ?? ''))
      : Date.parse(String(series[0].recorded_at ?? ''));
    const mapped: PyrolysisSensorReading[] = series.map((reading) => {
      const pointMs = useSensorClock
        ? this.epochMs(reading.utc_epoch) ?? Date.parse(String(reading.recorded_at ?? ''))
        : Date.parse(String(reading.recorded_at ?? ''));
      const temperature = Number(reading.temperature);
      return {
        time_offset_seconds: Number.isFinite(pointMs) && Number.isFinite(firstMs)
          ? Math.max(0, Math.round((pointMs - firstMs) / 1000))
          : Number(reading.time_offset_seconds) || 0,
        temperature: Number.isFinite(temperature) ? temperature : 0,
        recorded_at: new Date(Number.isFinite(pointMs) ? pointMs : firstMs).toISOString(),
        top_c: this.nullableNumber(reading.top_c),
        middle_c: this.nullableNumber(reading.middle_c),
        bottom_c: this.nullableNumber(reading.bottom_c),
      };
    });

    const core = mapped.length >= 20
      ? mapped.slice(Math.floor(mapped.length * 0.1), Math.ceil(mapped.length * 0.9))
      : mapped;
    const zoneValues = core
      .map((reading) => reading.middle_c ?? reading.temperature)
      .filter((value) => Number.isFinite(value));
    const lowest = zoneValues.length ? Math.min(...zoneValues) : null;

    return {
      id: candidate.id as string,
      batch_name: candidate.batch_name as string,
      kiln_id: candidate.kiln_id as string,
      started_at: new Date(logStart).toISOString(),
      ended_at: new Date(logEnd).toISOString(),
      clock: useSensorClock ? 'sensor' : 'phone',
      point_count: mapped.length,
      lowest_c: lowest,
      ends_excluded: mapped.length >= 20,
      stayed_at_or_above_350: lowest == null ? null : lowest >= 350,
      readings: this.downsampleReadings(mapped, 360),
    };
  }

  private downsampleReadings(readings: PyrolysisSensorReading[], max: number): PyrolysisSensorReading[] {
    if (readings.length <= max) return readings;
    const step = Math.ceil(readings.length / (max - 2));
    const picked = new Map<number, PyrolysisSensorReading>();
    readings.forEach((reading, index) => {
      if (index % step === 0) picked.set(index, reading);
    });
    let minIndex = 0;
    let maxIndex = 0;
    readings.forEach((reading, index) => {
      const value = reading.middle_c ?? reading.temperature;
      const minValue = readings[minIndex].middle_c ?? readings[minIndex].temperature;
      const maxValue = readings[maxIndex].middle_c ?? readings[maxIndex].temperature;
      if (value < minValue) minIndex = index;
      if (value > maxValue) maxIndex = index;
    });
    picked.set(minIndex, readings[minIndex]);
    picked.set(maxIndex, readings[maxIndex]);
    picked.set(readings.length - 1, readings[readings.length - 1]);
    return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, reading]) => reading);
  }

  private epochMs(value: unknown): number | null {
    const epoch = Number(value);
    if (!Number.isFinite(epoch) || epoch < 1_000_000_000) return null;
    return epoch > 1e12 ? epoch : epoch * 1000;
  }

  private nullableNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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
