import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  APPLICATION_MEDIA_TYPES,
  canAccessMobileApp,
  canAccessWebPortal,
  canReviewApplicationEntries,
  isApplicationEntryMediaKey,
  type ApplicationEntryMediaFlag,
  type ApplicationEntryRecord,
  type ApplicationEntryReviewStatus,
  type ApplicationEntryStatusRecord,
  type ApplicationMediaType,
  type ApplicationPyrolysisLinkRecord,
  type AvailableApplicationPyrolysisBatch,
  type CreateApplicationEntryPayload,
  type SubmitApplicationEntryStatusPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';

const ENTRY_PORTAL_SELECT = `
  id,
  operator_id,
  applied_at,
  farm_id,
  farm_name,
  location_lat,
  location_lng,
  location_address,
  comment,
  media_type,
  media_url,
  media_metadata,
  status,
  created_at,
  updated_at,
  users:operator_id (
    id,
    full_name
  ),
  application_pyrolysis_links (
    pyrolysis_batch_id,
    kontikki_code,
    batch_number,
    producer_name
  ),
  application_entry_status (
    id,
    entry_id,
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
    application_entry_media_flags (
      media_key,
      flagged
    )
  )
`;

export interface ApplicationEntryPortalRecord extends ApplicationEntryRecord {
  operator_name: string;
  review_status: ApplicationEntryReviewStatus;
  reviewed_at?: string | null;
}

const ENTRY_SELECT = `
  id,
  operator_id,
  applied_at,
  farm_id,
  farm_name,
  location_lat,
  location_lng,
  location_address,
  comment,
  media_type,
  media_url,
  media_metadata,
  status,
  created_at,
  updated_at,
  application_pyrolysis_links (
    pyrolysis_batch_id,
    kontikki_code,
    batch_number,
    producer_name
  ),
  application_entry_status (
    id,
    entry_id,
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
    application_entry_media_flags (
      media_key,
      flagged
    )
  )
`;

const AVAILABLE_BATCH_SELECT = `
  id,
  batch_number,
  kontikki_id,
  kontikki_code,
  yield_percent,
  pyrolysis_sessions!inner (
    status,
    completed_at
  ),
  kontikkis (
    id,
    biochar_producer_id,
    biochar_producer:biochar_producers (
      id,
      name
    )
  )
`;

@Injectable()
export class ApplicationEntriesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly mobileNetworkService: MobileNetworkService,
  ) {}

  async listEntries(
    user: AuthenticatedUser,
  ): Promise<ApplicationEntryRecord[] | ApplicationEntryPortalRecord[]> {
    if (canAccessWebPortal(user.role)) {
      const { data, error } = await this.supabase
        .from('application_entries')
        .select(ENTRY_PORTAL_SELECT)
        .order('applied_at', { ascending: false });

      if (error) throw new BadRequestException(error.message);
      return (data ?? []).map((row) => this.mapPortalEntryRow(row));
    }

    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('application_entries')
      .select(ENTRY_SELECT)
      .eq('operator_id', user.id)
      .order('applied_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => this.mapEntryRow(row));
  }

  async getEntry(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ApplicationEntryRecord | ApplicationEntryPortalRecord> {
    if (canAccessWebPortal(user.role)) {
      const { data, error } = await this.supabase
        .from('application_entries')
        .select(ENTRY_PORTAL_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new BadRequestException(error.message);
      if (!data) throw new NotFoundException('Application entry not found.');
      return this.mapPortalEntryRow(data);
    }

    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('application_entries')
      .select(ENTRY_SELECT)
      .eq('id', id)
      .eq('operator_id', user.id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Application entry not found.');
    return this.mapEntryRow(data);
  }

  async listAvailablePyrolysisBatches(
    user: AuthenticatedUser,
  ): Promise<AvailableApplicationPyrolysisBatch[]> {
    this.assertMobileAccess(user);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    if (allowedKontikkiIds.size === 0) return [];

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(AVAILABLE_BATCH_SELECT)
      .eq('pyrolysis_completed', true)
      .in('kontikki_id', Array.from(allowedKontikkiIds))
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    return (data ?? [])
      .filter((row) => {
        const session = row.pyrolysis_sessions as { status?: string } | null;
        return session?.status === 'completed';
      })
      .map((row) => this.mapAvailableBatchRow(row));
  }

  async createEntry(
    user: AuthenticatedUser,
    payload: CreateApplicationEntryPayload,
  ): Promise<ApplicationEntryRecord> {
    this.assertMobileAccess(user);
    this.validateCreatePayload(payload);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    await this.assertPyrolysisBatchesAllowed(payload.pyrolysis_batch_ids, allowedKontikkiIds);

    const linkMeta = await this.fetchLinkMeta(payload.pyrolysis_batch_ids);

    const { data: entry, error: entryError } = await this.supabase
      .from('application_entries')
      .insert({
        operator_id: user.id,
        applied_at: payload.applied_at,
        farm_id: payload.farm_id ?? null,
        farm_name: payload.farm_name ?? null,
        location_lat: payload.location_lat ?? null,
        location_lng: payload.location_lng ?? null,
        location_address: payload.location_address ?? null,
        comment: payload.comment ?? null,
        media_type: payload.media_type,
        media_url: payload.media_url ?? null,
        media_metadata: payload.media_metadata ?? null,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      throw new BadRequestException(entryError?.message ?? 'Could not create application entry.');
    }

    const linkRows = payload.pyrolysis_batch_ids.map((batchId) => {
      const meta = linkMeta.get(batchId);
      return {
        application_entry_id: entry.id,
        pyrolysis_batch_id: batchId,
        kontikki_code: meta?.kontikki_code ?? null,
        batch_number: meta?.batch_number ?? null,
        producer_name: meta?.producer_name ?? null,
      };
    });

    const { error: linkError } = await this.supabase
      .from('application_pyrolysis_links')
      .insert(linkRows);

    if (linkError) {
      await this.supabase.from('application_entries').delete().eq('id', entry.id);
      throw new BadRequestException(linkError.message);
    }

    const { error: statusError } = await this.supabase.from('application_entry_status').insert({
      entry_id: entry.id,
      status: 'pending_review',
    });

    if (statusError) {
      await this.supabase.from('application_entries').delete().eq('id', entry.id);
      throw new BadRequestException(statusError.message);
    }

    return this.getEntry(user, entry.id);
  }

  async submitEntryStatus(
    user: AuthenticatedUser,
    entryId: string,
    payload: SubmitApplicationEntryStatusPayload,
  ): Promise<ApplicationEntryPortalRecord> {
    this.assertCanReview(user);
    await this.getEntry(user, entryId);
    this.validateEntryStatusPayload(payload);

    const now = new Date().toISOString();

    const { data: entryStatus, error: statusError } = await this.supabase
      .from('application_entry_status')
      .upsert(
        {
          entry_id: entryId,
          status: payload.status,
          reviewer_notes: payload.reviewer_notes ?? null,
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        },
        { onConflict: 'entry_id' },
      )
      .select('id')
      .single();

    if (statusError) throw new BadRequestException(statusError.message);

    const entryStatusId = entryStatus.id as string;

    const { error: deleteError } = await this.supabase
      .from('application_entry_media_flags')
      .delete()
      .eq('entry_status_id', entryStatusId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    const flaggedMedia = (payload.media_flags ?? []).filter((flag) => flag.flagged);

    if (flaggedMedia.length > 0) {
      const flagRows = flaggedMedia.map((flag) => ({
        entry_status_id: entryStatusId,
        media_key: flag.media_key,
        flagged: true,
      }));

      const { error: insertError } = await this.supabase
        .from('application_entry_media_flags')
        .insert(flagRows);

      if (insertError) throw new BadRequestException(insertError.message);
    }

    const updated = await this.getEntry(user, entryId);
    return updated as ApplicationEntryPortalRecord;
  }

  private validateEntryStatusPayload(payload: SubmitApplicationEntryStatusPayload) {
    if (!payload.status) {
      throw new BadRequestException('Review status is required.');
    }

    for (const flag of payload.media_flags ?? []) {
      if (!isApplicationEntryMediaKey(flag.media_key)) {
        throw new BadRequestException(`Invalid media key: ${flag.media_key}`);
      }
    }
  }

  private assertCanReview(user: AuthenticatedUser) {
    if (!canReviewApplicationEntries(user.role)) {
      throw new ForbiddenException('Not allowed to review application entries.');
    }
  }

  private validateCreatePayload(payload: CreateApplicationEntryPayload) {
    if (!payload.applied_at) {
      throw new BadRequestException('applied_at is required.');
    }

    if (!payload.media_type || !APPLICATION_MEDIA_TYPES.includes(payload.media_type)) {
      throw new BadRequestException('Valid media_type is required.');
    }

    if (!payload.media_url?.trim()) {
      throw new BadRequestException('Application media is required.');
    }

    if (!payload.pyrolysis_batch_ids?.length) {
      throw new BadRequestException('At least one pyrolysis batch must be linked.');
    }
  }

  private async getAllowedKontikkiIds(user: AuthenticatedUser): Promise<Set<string>> {
    const overview = await this.mobileNetworkService.getOverview(user);
    return new Set(overview.kontikkis.map((row) => row.id));
  }

  private async assertPyrolysisBatchesAllowed(
    batchIds: string[],
    allowedKontikkiIds: Set<string>,
  ) {
    const uniqueIds = [...new Set(batchIds)];

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(
        `
        id,
        kontikki_id,
        pyrolysis_completed,
        pyrolysis_sessions!inner (status)
      `,
      )
      .in('id', uniqueIds);

    if (error) throw new BadRequestException(error.message);

    if ((data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException('One or more pyrolysis batches were not found.');
    }

    for (const row of data ?? []) {
      const session = row.pyrolysis_sessions as { status?: string } | null;
      if (!row.pyrolysis_completed || session?.status !== 'completed') {
        throw new BadRequestException(
          'Only completed pyrolysis batches can be linked to application.',
        );
      }

      if (!allowedKontikkiIds.has(String(row.kontikki_id))) {
        throw new ForbiddenException(
          'One or more pyrolysis batches are outside your assigned network.',
        );
      }
    }
  }

  private async fetchLinkMeta(batchIds: string[]) {
    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(
        `
        id,
        batch_number,
        kontikki_code,
        kontikkis (
          biochar_producer:biochar_producers (name)
        )
      `,
      )
      .in('id', batchIds);

    if (error) throw new BadRequestException(error.message);

    const map = new Map<
      string,
      { kontikki_code?: string | null; batch_number?: string | null; producer_name?: string | null }
    >();

    for (const row of data ?? []) {
      const kontikki = row.kontikkis as {
        biochar_producer?: { name?: string | null } | null;
      } | null;

      map.set(String(row.id), {
        kontikki_code: (row.kontikki_code as string) ?? null,
        batch_number: (row.batch_number as string) ?? null,
        producer_name: kontikki?.biochar_producer?.name ?? null,
      });
    }

    return map;
  }

  private mapEntryRow(row: Record<string, unknown>): ApplicationEntryRecord {
    const links = (row.application_pyrolysis_links ?? []) as Array<Record<string, unknown>>;
    const entryStatus = this.mapEntryStatus(row);

    return {
      id: String(row.id),
      operator_id: String(row.operator_id),
      applied_at: String(row.applied_at),
      farm_id: (row.farm_id as string) ?? null,
      farm_name: (row.farm_name as string) ?? null,
      location_lat: (row.location_lat as number) ?? null,
      location_lng: (row.location_lng as number) ?? null,
      location_address: (row.location_address as string) ?? null,
      comment: (row.comment as string) ?? null,
      media_type: row.media_type as ApplicationMediaType,
      media_url: (row.media_url as string) ?? null,
      media_metadata:
        (row.media_metadata as ApplicationEntryRecord['media_metadata']) ?? null,
      status: (row.status as ApplicationEntryRecord['status']) ?? 'submitted',
      entry_status: entryStatus,
      pyrolysis_links: links.map(
        (link): ApplicationPyrolysisLinkRecord => ({
          pyrolysis_batch_id: String(link.pyrolysis_batch_id),
          kontikki_code: (link.kontikki_code as string) ?? null,
          batch_number: (link.batch_number as string) ?? null,
          producer_name: (link.producer_name as string) ?? null,
        }),
      ),
      created_at: row.created_at as string | undefined,
      updated_at: row.updated_at as string | undefined,
    };
  }

  private mapEntryStatus(row: Record<string, unknown>): ApplicationEntryStatusRecord | null {
    const statusRow = this.unwrap(row.application_entry_status) as Record<
      string,
      unknown
    > | null;
    if (!statusRow) return null;

    const flags = (statusRow.application_entry_media_flags ?? []) as Array<
      Record<string, unknown>
    >;
    const reviewer = this.unwrap(statusRow.reviewer) as {
      id?: string;
      full_name?: string | null;
    } | null;

    return {
      id: String(statusRow.id),
      entry_id: String(statusRow.entry_id),
      status: statusRow.status as ApplicationEntryReviewStatus,
      reviewer_notes: (statusRow.reviewer_notes as string) ?? null,
      reviewed_by: (statusRow.reviewed_by as string) ?? null,
      reviewed_at: (statusRow.reviewed_at as string) ?? null,
      media_flags: flags.map(
        (flag): ApplicationEntryMediaFlag => ({
          media_key: flag.media_key as ApplicationEntryMediaFlag['media_key'],
          flagged: Boolean(flag.flagged),
        }),
      ),
      reviewer: reviewer?.id
        ? { id: reviewer.id, full_name: reviewer.full_name ?? null }
        : null,
      created_at: statusRow.created_at as string | undefined,
      updated_at: statusRow.updated_at as string | undefined,
    };
  }

  private mapAvailableBatchRow(row: Record<string, unknown>): AvailableApplicationPyrolysisBatch {
    const session = row.pyrolysis_sessions as { completed_at?: string | null } | null;
    const kontikki = row.kontikkis as {
      biochar_producer_id?: string | null;
      biochar_producer?: { id?: string; name?: string | null } | null;
    } | null;

    return {
      id: String(row.id),
      batch_number: (row.batch_number as string) ?? null,
      kontikki_id: String(row.kontikki_id),
      kontikki_code: String(row.kontikki_code),
      producer_id: kontikki?.biochar_producer_id ?? kontikki?.biochar_producer?.id ?? null,
      producer_name: kontikki?.biochar_producer?.name ?? null,
      session_completed_at: session?.completed_at ?? null,
      yield_percent: row.yield_percent != null ? Number(row.yield_percent) : null,
    };
  }

  private mapPortalEntryRow(row: Record<string, unknown>): ApplicationEntryPortalRecord {
    const operator = this.unwrap(row.users) as { full_name?: string | null } | null;
    const base = this.mapEntryRow(row);

    return {
      ...base,
      operator_name: operator?.full_name?.trim() || 'Unknown',
      review_status: base.entry_status?.status ?? 'pending_review',
      reviewed_at: base.entry_status?.reviewed_at ?? null,
    };
  }

  private unwrap<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private assertMobileAccess(user: AuthenticatedUser) {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to access application entries.');
    }
  }
}
