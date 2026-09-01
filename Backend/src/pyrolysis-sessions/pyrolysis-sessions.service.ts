import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  type PyrolysisBatchRecord,
  type PyrolysisSessionRecord,
  type PyrolysisStep,
  type StartPyrolysisSessionPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';

const BATCH_UPDATABLE_FIELDS = [
  'batch_number',
  'feedstock_quantity',
  'avg_feedstock_size_cm',
  'feedstock_id',
  'feedstock_name',
  'location_lat',
  'location_lng',
  'location_address',
  'feedstock_photo_url',
  'feedstock_size_photo_url',
  'feedstock_photo_metadata',
  'feedstock_size_photo_metadata',
  'moisture_reading_1',
  'moisture_reading_2',
  'moisture_reading_3',
  'moisture_reading_4',
  'moisture_reading_5',
  'moisture_photo_url_1',
  'moisture_photo_url_2',
  'moisture_photo_url_3',
  'moisture_photo_url_4',
  'moisture_photo_url_5',
  'moisture_photo_metadata_1',
  'moisture_photo_metadata_2',
  'moisture_photo_metadata_3',
  'moisture_photo_metadata_4',
  'moisture_photo_metadata_5',
  'stage_initial_photo_url',
  'stage_middle_photo_url',
  'stage_final_photo_url',
  'stage_quenching_photo_url',
  'stage_initial_captured_at',
  'stage_middle_captured_at',
  'stage_final_captured_at',
  'stage_quenching_captured_at',
  'stage_initial_saved_at',
  'stage_middle_saved_at',
  'stage_final_saved_at',
  'stage_quenching_saved_at',
  'stage_initial_photo_metadata',
  'stage_middle_photo_metadata',
  'stage_final_photo_metadata',
  'stage_quenching_photo_metadata',
  'info_completed',
  'moisture_completed',
  'pyrolysis_completed',
  'info_saved_at',
  'moisture_saved_at',
  'pyrolysis_saved_at',
  'yield_saved_at',
  'yield_percent',
  'comment',
  'sample_id',
  'sample_photo_url',
  'sample_photo_metadata',
  'sample_saved_at',
  'submission_status',
] as const;

export type UpdatePyrolysisBatchPayload = Partial<
  Pick<PyrolysisBatchRecord, (typeof BATCH_UPDATABLE_FIELDS)[number]>
>;

@Injectable()
export class PyrolysisSessionsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly mobileNetworkService: MobileNetworkService,
  ) {}

  async listSessions(user: AuthenticatedUser): Promise<PyrolysisSessionRecord[]> {
    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('pyrolysis_sessions')
      .select('id, operator_id, status, current_step, created_at, updated_at')
      .eq('operator_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    const sessions = await Promise.all(
      (data ?? []).map((row) => this.getSession(user, row.id as string)),
    );
    return sessions;
  }

  async startSession(
    user: AuthenticatedUser,
    payload: StartPyrolysisSessionPayload,
  ): Promise<PyrolysisSessionRecord> {
    this.assertMobileAccess(user);

    const kontikkiIds = [...new Set(payload.kontikki_ids ?? [])];
    if (kontikkiIds.length === 0) {
      throw new BadRequestException('Select at least one kontikki.');
    }

    const allowed = await this.getAllowedKontikkiIds(user);
    const unauthorized = kontikkiIds.filter((id) => !allowed.has(id));
    if (unauthorized.length > 0) {
      throw new ForbiddenException('One or more kontikkis are not assigned to you.');
    }

    const resumed = await this.resumeOrClearActiveKontikkiUse(user, kontikkiIds);
    if (resumed) {
      return resumed;
    }

    const { data: kontikkis, error: kontikkiError } = await this.supabase
      .from('kontikkis')
      .select('id, kontikki_code, status')
      .in('id', kontikkiIds);

    if (kontikkiError) throw new BadRequestException(kontikkiError.message);
    if ((kontikkis ?? []).length !== kontikkiIds.length) {
      throw new BadRequestException('One or more kontikkis were not found.');
    }

    const inactive = (kontikkis ?? []).filter((row) => row.status !== 'active');
    if (inactive.length > 0) {
      throw new BadRequestException('Only active kontikkis can start a batch.');
    }

    const { data: session, error: sessionError } = await this.supabase
      .from('pyrolysis_sessions')
      .insert({
        operator_id: user.id,
        status: 'active',
        current_step: 'info',
      })
      .select('id')
      .single();

    if (sessionError) throw new BadRequestException(sessionError.message);

    const batchRows = (kontikkis ?? []).map((row) => ({
      session_id: session.id,
      kontikki_id: row.id,
      kontikki_code: row.kontikki_code,
    }));

    const { error: batchError } = await this.supabase
      .from('pyrolysis_batches')
      .insert(batchRows);

    if (batchError) {
      await this.supabase.from('pyrolysis_sessions').delete().eq('id', session.id);
      throw new BadRequestException(batchError.message);
    }

    return this.getSession(user, session.id as string);
  }

  async getSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<PyrolysisSessionRecord> {
    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('pyrolysis_sessions')
      .select('id, operator_id, status, current_step, created_at, updated_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pyrolysis session not found.');
    if (data.operator_id !== user.id) {
      throw new ForbiddenException('Not allowed to view this session.');
    }

    const batches = await this.loadBatchesForSession(sessionId);
    return {
      id: data.id as string,
      operator_id: data.operator_id as string,
      status: data.status as PyrolysisSessionRecord['status'],
      current_step: data.current_step as PyrolysisSessionRecord['current_step'],
      batches,
      created_at: data.created_at as string | undefined,
      updated_at: data.updated_at as string | undefined,
    };
  }

  async updateSessionStep(
    user: AuthenticatedUser,
    sessionId: string,
    currentStep: PyrolysisStep,
  ): Promise<PyrolysisSessionRecord> {
    await this.getSession(user, sessionId);

    const { error } = await this.supabase
      .from('pyrolysis_sessions')
      .update({ current_step: currentStep, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw new BadRequestException(error.message);
    return this.getSession(user, sessionId);
  }

  async updateBatch(
    user: AuthenticatedUser,
    sessionId: string,
    batchId: string,
    payload: UpdatePyrolysisBatchPayload,
  ): Promise<PyrolysisSessionRecord> {
    await this.getSession(user, sessionId);

    const batchUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of BATCH_UPDATABLE_FIELDS) {
      if (payload[field] !== undefined) batchUpdates[field] = payload[field];
    }

    const { error: batchError } = await this.supabase
      .from('pyrolysis_batches')
      .update(batchUpdates)
      .eq('id', batchId)
      .eq('session_id', sessionId);

    if (batchError) throw new BadRequestException(batchError.message);

    return this.getSession(user, sessionId);
  }

  async deleteBatch(
    user: AuthenticatedUser,
    sessionId: string,
    batchId: string,
  ): Promise<{ session: PyrolysisSessionRecord | null }> {
    const session = await this.getSession(user, sessionId);

    const batch = session.batches.find((row) => row.id === batchId);
    if (!batch) {
      throw new NotFoundException('Batch not found in this session.');
    }
    if (batch.submission_status === 'submitted') {
      throw new BadRequestException(
        'Only unsubmitted kontikki entries can be deleted.',
      );
    }

    const { error } = await this.supabase
      .from('pyrolysis_batches')
      .delete()
      .eq('id', batchId)
      .eq('session_id', sessionId);

    if (error) throw new BadRequestException(error.message);

    const remaining = session.batches.filter((row) => row.id !== batchId);
    if (remaining.length === 0) {
      const { error: cancelError } = await this.supabase
        .from('pyrolysis_sessions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (cancelError) throw new BadRequestException(cancelError.message);
      return { session: null };
    }

    return { session: await this.getSession(user, sessionId) };
  }

  async completeSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<PyrolysisSessionRecord> {
    await this.getSession(user, sessionId);

    const { error } = await this.supabase
      .from('pyrolysis_sessions')
      .update({
        status: 'completed',
        current_step: 'complete',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) throw new BadRequestException(error.message);
    return this.getSession(user, sessionId);
  }

  async listBatchReviewStatuses(user: AuthenticatedUser): Promise<
    Array<{
      batch_id: string;
      review_status: string;
      reviewer_notes: string | null;
    }>
  > {
    this.assertMobileAccess(user);

    const { data: sessions, error: sessionError } = await this.supabase
      .from('pyrolysis_sessions')
      .select('id')
      .eq('operator_id', user.id);

    if (sessionError) throw new BadRequestException(sessionError.message);
    const sessionIds = (sessions ?? []).map((row) => row.id as string);
    if (sessionIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select('id, pyrolysis_batch_status ( status, reviewer_notes )')
      .in('session_id', sessionIds);

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const statusRow = this.unwrapRecord(row.pyrolysis_batch_status);
      return {
        batch_id: row.id as string,
        review_status: (statusRow?.status as string | undefined) ?? 'pending',
        reviewer_notes: (statusRow?.reviewer_notes as string | null | undefined) ?? null,
      };
    });
  }

  private async loadBatchesForSession(sessionId: string): Promise<PyrolysisBatchRecord[]> {
    const { data: batches, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(
        `
        *,
        pyrolysis_batch_status (
          status,
          reviewer_notes
        )
      `,
      )
      .eq('session_id', sessionId)
      .order('kontikki_code', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    return (batches ?? []).map((row) => this.mapBatch(row));
  }

  private mapBatch(row: Record<string, unknown>): PyrolysisBatchRecord {
    const numeric = (value: unknown) => (value != null ? Number(value) : null);
    const batchStatus = this.unwrapRecord(row.pyrolysis_batch_status);

    return {
      id: row.id as string,
      session_id: row.session_id as string,
      kontikki_id: row.kontikki_id as string,
      kontikki_code: row.kontikki_code as string,
      submission_status: ((row.submission_status as string) ?? 'draft') as PyrolysisBatchRecord['submission_status'],
      review_status: (batchStatus?.status as string | undefined) ?? 'pending',
      reviewer_notes: (batchStatus?.reviewer_notes as string | null | undefined) ?? null,
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
      feedstock_photo_metadata: (row.feedstock_photo_metadata as PyrolysisBatchRecord['feedstock_photo_metadata']) ?? null,
      feedstock_size_photo_metadata: (row.feedstock_size_photo_metadata as PyrolysisBatchRecord['feedstock_size_photo_metadata']) ?? null,
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
      moisture_photo_metadata_1: (row.moisture_photo_metadata_1 as PyrolysisBatchRecord['moisture_photo_metadata_1']) ?? null,
      moisture_photo_metadata_2: (row.moisture_photo_metadata_2 as PyrolysisBatchRecord['moisture_photo_metadata_2']) ?? null,
      moisture_photo_metadata_3: (row.moisture_photo_metadata_3 as PyrolysisBatchRecord['moisture_photo_metadata_3']) ?? null,
      moisture_photo_metadata_4: (row.moisture_photo_metadata_4 as PyrolysisBatchRecord['moisture_photo_metadata_4']) ?? null,
      moisture_photo_metadata_5: (row.moisture_photo_metadata_5 as PyrolysisBatchRecord['moisture_photo_metadata_5']) ?? null,
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
      stage_initial_photo_metadata: (row.stage_initial_photo_metadata as PyrolysisBatchRecord['stage_initial_photo_metadata']) ?? null,
      stage_middle_photo_metadata: (row.stage_middle_photo_metadata as PyrolysisBatchRecord['stage_middle_photo_metadata']) ?? null,
      stage_final_photo_metadata: (row.stage_final_photo_metadata as PyrolysisBatchRecord['stage_final_photo_metadata']) ?? null,
      stage_quenching_photo_metadata: (row.stage_quenching_photo_metadata as PyrolysisBatchRecord['stage_quenching_photo_metadata']) ?? null,
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

  private unwrapRecord(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (Array.isArray(value)) {
      return (value[0] as Record<string, unknown> | undefined) ?? null;
    }
    return value as Record<string, unknown>;
  }

  private unwrapSession(value: unknown): {
    id?: string;
    status?: string;
    operator_id?: string;
    reviewer_notes?: string | null;
  } | null {
    return this.unwrapRecord(value) as {
      id?: string;
      status?: string;
      operator_id?: string;
      reviewer_notes?: string | null;
    } | null;
  }

  private isAbandonedBatch(
    row: Pick<
      PyrolysisBatchRecord,
      | 'batch_number'
      | 'info_completed'
      | 'moisture_completed'
      | 'pyrolysis_completed'
      | 'yield_percent'
      | 'sample_id'
    >,
  ): boolean {
    return (
      !row.batch_number &&
      !row.info_completed &&
      !row.moisture_completed &&
      !row.pyrolysis_completed &&
      row.yield_percent == null &&
      !row.sample_id
    );
  }

  private async cancelSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pyrolysis_sessions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) throw new BadRequestException(error.message);
  }

  private async resumeOrClearActiveKontikkiUse(
    user: AuthenticatedUser,
    kontikkiIds: string[],
  ): Promise<PyrolysisSessionRecord | null> {
    // Only draft (not-yet-submitted) batches keep a kontikki reserved —
    // once an entry is submitted it no longer blocks starting a new batch
    // for that kontikki, even while the rest of its session is still active.
    const { data: activeUse, error: activeError } = await this.supabase
      .from('pyrolysis_batches')
      .select(
        'kontikki_id, kontikki_code, session_id, pyrolysis_sessions!inner(id, status, operator_id)',
      )
      .in('kontikki_id', kontikkiIds)
      .eq('submission_status', 'draft')
      .eq('pyrolysis_sessions.status', 'active');

    if (activeError) throw new BadRequestException(activeError.message);
    if (!activeUse?.length) return null;

    const bySession = new Map<
      string,
      { operatorId: string; kontikkiIds: string[]; codes: string[] }
    >();

    for (const row of activeUse) {
      const session = this.unwrapSession(row.pyrolysis_sessions);
      const sessionId = (session?.id as string | undefined) ?? (row.session_id as string);
      if (!sessionId) continue;

      const current = bySession.get(sessionId) ?? {
        operatorId: (session?.operator_id as string | undefined) ?? '',
        kontikkiIds: [],
        codes: [],
      };
      current.kontikkiIds.push(row.kontikki_id as string);
      if (row.kontikki_code) current.codes.push(row.kontikki_code as string);
      bySession.set(sessionId, current);
    }

    const foreign = [...bySession.entries()].filter(
      ([, value]) => value.operatorId !== user.id,
    );
    if (foreign.length > 0) {
      const codes = [...new Set(foreign.flatMap(([, value]) => value.codes))];
      throw new ConflictException(
        codes.length
          ? `One or more kontikkis are already in an active batch (${codes.join(', ')}).`
          : 'One or more kontikkis are already in an active batch.',
      );
    }

    const requested = new Set(kontikkiIds);
    for (const [sessionId] of bySession) {
      const session = await this.getSession(user, sessionId);
      const sessionKontikkiIds = new Set(session.batches.map((batch) => batch.kontikki_id));
      const coversRequested = kontikkiIds.every((id) => sessionKontikkiIds.has(id));
      if (coversRequested) {
        return session;
      }

      const abandoned = session.batches.every((batch) =>
        this.isAbandonedBatch(batch),
      );
      const overlapsRequested = session.batches.some((batch) =>
        requested.has(batch.kontikki_id),
      );
      if (abandoned && overlapsRequested) {
        await this.cancelSession(sessionId);
      }
    }

    const { data: stillLocked, error: lockedError } = await this.supabase
      .from('pyrolysis_batches')
      .select('kontikki_code, pyrolysis_sessions!inner(status, operator_id)')
      .in('kontikki_id', kontikkiIds)
      .eq('submission_status', 'draft')
      .eq('pyrolysis_sessions.status', 'active');

    if (lockedError) throw new BadRequestException(lockedError.message);
    if (stillLocked?.length) {
      const codes = [
        ...new Set(
          stillLocked
            .map((row) => row.kontikki_code as string | null)
            .filter((code): code is string => Boolean(code)),
        ),
      ];
      throw new ConflictException(
        codes.length
          ? `One or more kontikkis are already in an active batch (${codes.join(', ')}). Complete or cancel that batch first.`
          : 'One or more kontikkis are already in an active batch.',
      );
    }

    return null;
  }

  private async getAllowedKontikkiIds(user: AuthenticatedUser): Promise<Set<string>> {
    const overview = await this.mobileNetworkService.getOverview(user);
    return new Set(overview.kontikkis.map((row) => row.id));
  }

  private assertMobileAccess(user: AuthenticatedUser) {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to access pyrolysis sessions.');
    }
  }
}
