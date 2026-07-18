import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  canAccessWebPortal,
  canReviewMixingEntries,
  isMixingEntryPhotoKey,
  MIXING_MATERIAL_TYPES,
  type AvailableMixingPyrolysisBatch,
  type CreateMixingEntryPayload,
  type MixingEntryPhotoFlag,
  type MixingEntryRecord,
  type MixingEntryReviewStatus,
  type MixingEntryStatusRecord,
  type MixingMaterialType,
  type MixingPyrolysisLinkRecord,
  type SubmitMixingEntryStatusPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';

const ENTRY_PORTAL_SELECT = `
  id,
  operator_id,
  started_at,
  farm_id,
  farm_name,
  location_lat,
  location_lng,
  location_address,
  material_type,
  material_to_biochar_ratio,
  comment,
  biochar_photo_url,
  biochar_photo_metadata,
  substrate_photo_url,
  substrate_photo_metadata,
  mixing_photo_url,
  mixing_photo_metadata,
  status,
  created_at,
  updated_at,
  users:operator_id (
    id,
    full_name
  ),
  mixing_pyrolysis_links (
    pyrolysis_batch_id,
    kontikki_code,
    batch_number,
    producer_name
  ),
  mixing_entry_status (
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
    mixing_entry_photo_flags (
      photo_key,
      flagged
    )
  )
`;

export interface MixingEntryPortalRecord extends MixingEntryRecord {
  operator_name: string;
  review_status: MixingEntryReviewStatus;
  reviewed_at?: string | null;
}

const ENTRY_SELECT = `
  id,
  operator_id,
  started_at,
  farm_id,
  farm_name,
  location_lat,
  location_lng,
  location_address,
  material_type,
  material_to_biochar_ratio,
  comment,
  biochar_photo_url,
  biochar_photo_metadata,
  substrate_photo_url,
  substrate_photo_metadata,
  mixing_photo_url,
  mixing_photo_metadata,
  status,
  created_at,
  updated_at,
  mixing_pyrolysis_links (
    pyrolysis_batch_id,
    kontikki_code,
    batch_number,
    producer_name
  ),
  mixing_entry_status (
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
    mixing_entry_photo_flags (
      photo_key,
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
export class MixingEntriesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly mobileNetworkService: MobileNetworkService,
  ) {}

  async listEntries(
    user: AuthenticatedUser,
  ): Promise<MixingEntryRecord[] | MixingEntryPortalRecord[]> {
    if (canAccessWebPortal(user.role)) {
      const { data, error } = await this.supabase
        .from('mixing_entries')
        .select(ENTRY_PORTAL_SELECT)
        .order('started_at', { ascending: false });

      if (error) {
        throw new BadRequestException(error.message);
      }

      return (data ?? []).map((row) => this.mapPortalEntryRow(row));
    }

    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('mixing_entries')
      .select(ENTRY_SELECT)
      .eq('operator_id', user.id)
      .order('started_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((row) => this.mapEntryRow(row));
  }

  async getEntry(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MixingEntryRecord | MixingEntryPortalRecord> {
    if (canAccessWebPortal(user.role)) {
      const { data, error } = await this.supabase
        .from('mixing_entries')
        .select(ENTRY_PORTAL_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (!data) {
        throw new NotFoundException('Mixing entry not found.');
      }

      return this.mapPortalEntryRow(data);
    }

    this.assertMobileAccess(user);

    const { data, error } = await this.supabase
      .from('mixing_entries')
      .select(ENTRY_SELECT)
      .eq('id', id)
      .eq('operator_id', user.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Mixing entry not found.');
    }

    return this.mapEntryRow(data);
  }

  async listAvailablePyrolysisBatches(
    user: AuthenticatedUser,
  ): Promise<AvailableMixingPyrolysisBatch[]> {
    this.assertMobileAccess(user);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    if (allowedKontikkiIds.size === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('pyrolysis_batches')
      .select(AVAILABLE_BATCH_SELECT)
      .eq('pyrolysis_completed', true)
      .in('kontikki_id', Array.from(allowedKontikkiIds))
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? [])
      .filter((row) => {
        const session = row.pyrolysis_sessions as { status?: string } | null;
        return session?.status === 'completed';
      })
      .map((row) => this.mapAvailableBatchRow(row));
  }

  async createEntry(
    user: AuthenticatedUser,
    payload: CreateMixingEntryPayload,
  ): Promise<MixingEntryRecord> {
    this.assertMobileAccess(user);
    this.validateCreatePayload(payload);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    await this.assertPyrolysisBatchesAllowed(
      payload.pyrolysis_batch_ids,
      allowedKontikkiIds,
    );

    const linkMeta = await this.fetchLinkMeta(payload.pyrolysis_batch_ids);

    const { data: entry, error: entryError } = await this.supabase
      .from('mixing_entries')
      .insert({
        operator_id: user.id,
        started_at: payload.started_at,
        farm_id: payload.farm_id ?? null,
        farm_name: payload.farm_name ?? null,
        location_lat: payload.location_lat ?? null,
        location_lng: payload.location_lng ?? null,
        location_address: payload.location_address ?? null,
        material_type: payload.material_type,
        material_to_biochar_ratio: payload.material_to_biochar_ratio ?? null,
        comment: payload.comment ?? null,
        biochar_photo_url: payload.biochar_photo_url ?? null,
        biochar_photo_metadata: payload.biochar_photo_metadata ?? null,
        substrate_photo_url: payload.substrate_photo_url ?? null,
        substrate_photo_metadata: payload.substrate_photo_metadata ?? null,
        mixing_photo_url: payload.mixing_photo_url ?? null,
        mixing_photo_metadata: payload.mixing_photo_metadata ?? null,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      throw new BadRequestException(entryError?.message ?? 'Could not create mixing entry.');
    }

    const linkRows = payload.pyrolysis_batch_ids.map((batchId) => {
      const meta = linkMeta.get(batchId);
      return {
        mixing_entry_id: entry.id,
        pyrolysis_batch_id: batchId,
        kontikki_code: meta?.kontikki_code ?? null,
        batch_number: meta?.batch_number ?? null,
        producer_name: meta?.producer_name ?? null,
      };
    });

    const { error: linkError } = await this.supabase
      .from('mixing_pyrolysis_links')
      .insert(linkRows);

    if (linkError) {
      await this.supabase.from('mixing_entries').delete().eq('id', entry.id);
      throw new BadRequestException(linkError.message);
    }

    const { error: statusError } = await this.supabase.from('mixing_entry_status').insert({
      entry_id: entry.id,
      status: 'pending_review',
    });

    if (statusError) {
      await this.supabase.from('mixing_entries').delete().eq('id', entry.id);
      throw new BadRequestException(statusError.message);
    }

    return this.getEntry(user, entry.id);
  }

  async submitEntryStatus(
    user: AuthenticatedUser,
    entryId: string,
    payload: SubmitMixingEntryStatusPayload,
  ): Promise<MixingEntryPortalRecord> {
    this.assertCanReview(user);
    await this.getEntry(user, entryId);
    this.validateEntryStatusPayload(payload);

    const now = new Date().toISOString();

    const { data: entryStatus, error: statusError } = await this.supabase
      .from('mixing_entry_status')
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

    if (statusError) {
      throw new BadRequestException(statusError.message);
    }

    const entryStatusId = entryStatus.id as string;

    const { error: deleteError } = await this.supabase
      .from('mixing_entry_photo_flags')
      .delete()
      .eq('entry_status_id', entryStatusId);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    const flaggedPhotos = (payload.photo_flags ?? []).filter((flag) => flag.flagged);

    if (flaggedPhotos.length > 0) {
      const flagRows = flaggedPhotos.map((flag) => ({
        entry_status_id: entryStatusId,
        photo_key: flag.photo_key,
        flagged: true,
      }));

      const { error: insertError } = await this.supabase
        .from('mixing_entry_photo_flags')
        .insert(flagRows);

      if (insertError) {
        throw new BadRequestException(insertError.message);
      }
    }

    const updated = await this.getEntry(user, entryId);
    return updated as MixingEntryPortalRecord;
  }

  private validateEntryStatusPayload(payload: SubmitMixingEntryStatusPayload) {
    if (!payload.status) {
      throw new BadRequestException('Review status is required.');
    }

    for (const flag of payload.photo_flags ?? []) {
      if (!isMixingEntryPhotoKey(flag.photo_key)) {
        throw new BadRequestException(`Invalid photo key: ${flag.photo_key}`);
      }
    }
  }

  private assertCanReview(user: AuthenticatedUser) {
    if (!canReviewMixingEntries(user.role)) {
      throw new ForbiddenException('Not allowed to review mixing entries.');
    }
  }

  private validateCreatePayload(payload: CreateMixingEntryPayload) {
    if (!payload.started_at) {
      throw new BadRequestException('started_at is required.');
    }

    if (!payload.material_type || !MIXING_MATERIAL_TYPES.includes(payload.material_type)) {
      throw new BadRequestException('Valid material_type is required.');
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

    if (error) {
      throw new BadRequestException(error.message);
    }

    if ((data ?? []).length !== uniqueIds.length) {
      throw new BadRequestException('One or more pyrolysis batches were not found.');
    }

    for (const row of data ?? []) {
      const session = row.pyrolysis_sessions as { status?: string } | null;
      if (!row.pyrolysis_completed || session?.status !== 'completed') {
        throw new BadRequestException(
          'Only completed pyrolysis batches can be linked to mixing.',
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

    if (error) {
      throw new BadRequestException(error.message);
    }

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

  private mapEntryRow(row: Record<string, unknown>): MixingEntryRecord {
    const links = (row.mixing_pyrolysis_links ?? []) as Array<Record<string, unknown>>;
    const entryStatus = this.mapEntryStatus(row);

    return {
      id: String(row.id),
      operator_id: String(row.operator_id),
      started_at: String(row.started_at),
      farm_id: (row.farm_id as string) ?? null,
      farm_name: (row.farm_name as string) ?? null,
      location_lat: row.location_lat != null ? Number(row.location_lat) : null,
      location_lng: row.location_lng != null ? Number(row.location_lng) : null,
      location_address: (row.location_address as string) ?? null,
      material_type: (row.material_type as MixingMaterialType) ?? null,
      material_to_biochar_ratio:
        row.material_to_biochar_ratio != null
          ? Number(row.material_to_biochar_ratio)
          : null,
      comment: (row.comment as string) ?? null,
      biochar_photo_url: (row.biochar_photo_url as string) ?? null,
      biochar_photo_metadata:
        (row.biochar_photo_metadata as MixingEntryRecord['biochar_photo_metadata']) ?? null,
      substrate_photo_url: (row.substrate_photo_url as string) ?? null,
      substrate_photo_metadata:
        (row.substrate_photo_metadata as MixingEntryRecord['substrate_photo_metadata']) ?? null,
      mixing_photo_url: (row.mixing_photo_url as string) ?? null,
      mixing_photo_metadata:
        (row.mixing_photo_metadata as MixingEntryRecord['mixing_photo_metadata']) ?? null,
      status: (row.status as MixingEntryRecord['status']) ?? 'submitted',
      entry_status: entryStatus,
      pyrolysis_links: links.map(
        (link): MixingPyrolysisLinkRecord => ({
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

  private mapEntryStatus(row: Record<string, unknown>): MixingEntryStatusRecord | null {
    const statusRow = this.unwrap(row.mixing_entry_status) as Record<string, unknown> | null;
    if (!statusRow) return null;

    const flags = (statusRow.mixing_entry_photo_flags ?? []) as Array<
      Record<string, unknown>
    >;
    const reviewer = this.unwrap(statusRow.reviewer) as {
      id?: string;
      full_name?: string | null;
    } | null;

    return {
      id: String(statusRow.id),
      entry_id: String(statusRow.entry_id),
      status: statusRow.status as MixingEntryReviewStatus,
      reviewer_notes: (statusRow.reviewer_notes as string) ?? null,
      reviewed_by: (statusRow.reviewed_by as string) ?? null,
      reviewed_at: (statusRow.reviewed_at as string) ?? null,
      photo_flags: flags.map(
        (flag): MixingEntryPhotoFlag => ({
          photo_key: flag.photo_key as MixingEntryPhotoFlag['photo_key'],
          flagged: Boolean(flag.flagged),
        }),
      ),
      reviewer: reviewer?.id
        ? {
            id: reviewer.id,
            full_name: reviewer.full_name ?? null,
          }
        : null,
      created_at: statusRow.created_at as string | undefined,
      updated_at: statusRow.updated_at as string | undefined,
    };
  }

  private mapAvailableBatchRow(row: Record<string, unknown>): AvailableMixingPyrolysisBatch {
    const session = row.pyrolysis_sessions as {
      completed_at?: string | null;
    } | null;
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

  private mapPortalEntryRow(row: Record<string, unknown>): MixingEntryPortalRecord {
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
      throw new ForbiddenException('Not allowed to access mixing entries.');
    }
  }
}
