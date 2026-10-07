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
  canAccessNetwork,
  canReviewMixingEntries,
  isMixingEntryPhotoKey,
  isRainbowMixVolumeAllowed,
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

type MixRegistry = 'csi' | 'rainbow';

interface MixTables {
  registry: MixRegistry;
  entries: string;
  links: string;
  status: string;
  flags: string;
  sessions: string;
  batches: string;
}

const CSI_MIX: MixTables = {
  registry: 'csi',
  entries: 'csi_mixing_entries',
  links: 'csi_mixing_pyrolysis_links',
  status: 'csi_mixing_entry_status',
  flags: 'csi_mixing_entry_photo_flags',
  sessions: 'csi_pyrolysis_sessions',
  batches: 'csi_pyrolysis_batches',
};

const RAINBOW_MIX: MixTables = {
  registry: 'rainbow',
  entries: 'rainbow_mixing_entries',
  links: 'rainbow_mixing_pyrolysis_links',
  status: 'rainbow_mixing_entry_status',
  flags: 'rainbow_mixing_entry_photo_flags',
  sessions: 'rainbow_pyrolysis_sessions',
  batches: 'rainbow_pyrolysis_batches',
};

const MIX_TABLES = [CSI_MIX, RAINBOW_MIX];

function entrySelect(tables: MixTables, portal: boolean): string {
  const operator = portal
    ? `users:operator_id (id, full_name),`
    : '';
  return `
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
    ${operator}
    ${tables.links} (
      pyrolysis_batch_id,
      kontikki_code,
      batch_number,
      producer_name
    ),
    ${tables.status} (
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
      ${tables.flags} (
        photo_key,
        flagged
      )
    )
  `;
}

function availableBatchSelect(sessions: string): string {
  return `
    id,
    batch_number,
    kontikki_id,
    kontikki_code,
    yield_percent,
    ${sessions}!inner (
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
}

export interface MixingEntryPortalRecord extends MixingEntryRecord {
  operator_name: string;
  review_status: MixingEntryReviewStatus;
  reviewed_at?: string | null;
}

@Injectable()
export class MixingEntriesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly mobileNetworkService: MobileNetworkService,
  ) {}

  async listEntries(
    user: AuthenticatedUser,
  ): Promise<MixingEntryRecord[] | MixingEntryPortalRecord[]> {
    if (canAccessNetwork(user.role)) {
      return this.loadEntries(true, {});
    }

    if (user.role === 'supervisor') {
      const allowedEntryIds = await this.getAllowedEntryIds(user);
      if (allowedEntryIds.length === 0) return [];
      return this.loadEntries(true, { ids: allowedEntryIds });
    }

    this.assertMobileAccess(user);
    return this.loadEntries(false, { operatorId: user.id });
  }

  async getEntry(
    user: AuthenticatedUser,
    id: string,
  ): Promise<MixingEntryRecord | MixingEntryPortalRecord> {
    if (canAccessNetwork(user.role)) {
      const entry = await this.findEntry(id, true);
      if (!entry) throw new NotFoundException('Mixing entry not found.');
      return entry;
    }

    if (user.role === 'supervisor') {
      const allowedEntryIds = await this.getAllowedEntryIds(user);
      if (!allowedEntryIds.includes(id)) {
        throw new NotFoundException('Mixing entry not found.');
      }
      const entry = await this.findEntry(id, true);
      if (!entry) throw new NotFoundException('Mixing entry not found.');
      return entry;
    }

    this.assertMobileAccess(user);
    const entry = await this.findEntry(id, false, user.id);
    if (!entry) throw new NotFoundException('Mixing entry not found.');
    return entry;
  }

  async listAvailablePyrolysisBatches(
    user: AuthenticatedUser,
  ): Promise<AvailableMixingPyrolysisBatch[]> {
    this.assertMobileAccess(user);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    if (allowedKontikkiIds.size === 0) {
      return [];
    }

    const alreadyMixedBatchIds = await this.getAlreadyMixedBatchIds();

    let query = this.supabase
      .from(CSI_MIX.batches)
      .select(availableBatchSelect(CSI_MIX.sessions))
      .eq('pyrolysis_completed', true)
      .in('kontikki_id', Array.from(allowedKontikkiIds));

    if (alreadyMixedBatchIds.length > 0) {
      query = query.not('id', 'in', `(${alreadyMixedBatchIds.join(',')})`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    const csiRows = (data ?? []) as unknown as Record<string, unknown>[];
    const csiBatches = csiRows
      .filter((row) => this.sessionStatus(row, CSI_MIX.sessions) === 'completed')
      .map((row) => this.mapAvailableBatchRow(row, 'csi'));

    const rainbowBatches = await this.listAvailableRainbowBatches(
      allowedKontikkiIds,
      alreadyMixedBatchIds,
    );

    return [...csiBatches, ...rainbowBatches];
  }

  private async listAvailableRainbowBatches(
    allowedKontikkiIds: Set<string>,
    alreadyMixedBatchIds: string[],
  ): Promise<AvailableMixingPyrolysisBatch[]> {
    let query = this.supabase
      .from(RAINBOW_MIX.batches)
      .select(availableBatchSelect(RAINBOW_MIX.sessions))
      .eq('submission_status', 'submitted')
      .in('kontikki_id', Array.from(allowedKontikkiIds));

    if (alreadyMixedBatchIds.length > 0) {
      query = query.not('id', 'in', `(${alreadyMixedBatchIds.join(',')})`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    const rainbowRows = (data ?? []) as unknown as Record<string, unknown>[];
    return rainbowRows
      .filter((row) => this.sessionStatus(row, RAINBOW_MIX.sessions) === 'completed')
      .map((row) => this.mapAvailableBatchRow(row, 'rainbow'));
  }

  private async getAlreadyMixedBatchIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const tables of MIX_TABLES) {
      const { data, error } = await this.supabase
        .from(tables.links)
        .select('pyrolysis_batch_id');
      if (error) throw new BadRequestException(error.message);
      ids.push(...(data ?? []).map((row) => String(row.pyrolysis_batch_id)));
    }
    return [...new Set(ids)];
  }

  async createEntry(
    user: AuthenticatedUser,
    payload: CreateMixingEntryPayload,
  ): Promise<MixingEntryRecord> {
    this.assertMobileAccess(user);
    this.validateCreatePayload(payload);

    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    const split = await this.assertPyrolysisBatchesAllowed(
      payload.pyrolysis_batch_ids,
      allowedKontikkiIds,
    );
    if (split.csiIds.length > 0 && split.rainbowIds.length > 0) {
      throw new BadRequestException(
        'CSI and Rainbow batches are stored separately. Mix them in two entries.',
      );
    }

    const tables = split.rainbowIds.length > 0 ? RAINBOW_MIX : CSI_MIX;
    const batchIds = tables.registry === 'rainbow' ? split.rainbowIds : split.csiIds;
    if (tables.registry === 'rainbow') {
      if (!isRainbowMixVolumeAllowed(payload.material_to_biochar_ratio)) {
        throw new BadRequestException(
          'Rainbow soil mixes must be under half biochar by volume. Use 2:1 or 3:1 material to biochar.',
        );
      }
      if (payload.location_lat == null || payload.location_lng == null) {
        throw new BadRequestException(
          'Rainbow mixing needs a GPS location for the mix.',
        );
      }
      if (!payload.mixing_photo_url) {
        throw new BadRequestException(
          'Rainbow mixing needs a time-stamped photo of the mix.',
        );
      }
    }

    const linkMeta =
      tables.registry === 'rainbow'
        ? await this.fetchRainbowLinkMeta(batchIds)
        : await this.fetchLinkMeta(batchIds);

    const { data: entry, error: entryError } = await this.supabase
      .from(tables.entries)
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

    const linkRows = batchIds.map((batchId) => {
      const meta = linkMeta.get(batchId);
      return {
        mixing_entry_id: entry.id,
        pyrolysis_batch_id: batchId,
        kontikki_code: meta?.kontikki_code ?? null,
        batch_number: meta?.batch_number ?? null,
        producer_name: meta?.producer_name ?? null,
      };
    });
    const { error: linkError } = await this.supabase.from(tables.links).insert(linkRows);
    if (linkError) {
      await this.supabase.from(tables.entries).delete().eq('id', entry.id);
      throw new BadRequestException(linkError.message);
    }

    const { error: statusError } = await this.supabase.from(tables.status).insert({
      entry_id: entry.id,
      status: 'pending_review',
    });
    if (statusError) {
      await this.supabase.from(tables.entries).delete().eq('id', entry.id);
      throw new BadRequestException(statusError.message);
    }

    return this.getEntry(user, entry.id as string);
  }

  async submitEntryStatus(
    user: AuthenticatedUser,
    entryId: string,
    payload: SubmitMixingEntryStatusPayload,
  ): Promise<MixingEntryPortalRecord> {
    this.assertCanReview(user);
    const tables = await this.registryForEntry(entryId);
    await this.getEntry(user, entryId);
    this.validateEntryStatusPayload(payload);

    const now = new Date().toISOString();

    const { data: entryStatus, error: statusError } = await this.supabase
      .from(tables.status)
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
      .from(tables.flags)
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
        .from(tables.flags)
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

  private async getAllowedEntryIds(user: AuthenticatedUser): Promise<string[]> {
    const allowedKontikkiIds = await this.getAllowedKontikkiIds(user);
    if (allowedKontikkiIds.size === 0) {
      return [];
    }

    const entryIds: string[] = [];
    for (const tables of MIX_TABLES) {
      const { data: batches, error: batchError } = await this.supabase
        .from(tables.batches)
        .select('id')
        .in('kontikki_id', Array.from(allowedKontikkiIds));
      if (batchError) throw new BadRequestException(batchError.message);
      const batchIds = (batches ?? []).map((row) => row.id as string);
      if (batchIds.length === 0) continue;
      const { data: links, error: linkError } = await this.supabase
        .from(tables.links)
        .select('mixing_entry_id')
        .in('pyrolysis_batch_id', batchIds);
      if (linkError) throw new BadRequestException(linkError.message);
      entryIds.push(...(links ?? []).map((row) => row.mixing_entry_id as string));
    }

    return [...new Set(entryIds)];
  }

  private async assertPyrolysisBatchesAllowed(
    batchIds: string[],
    allowedKontikkiIds: Set<string>,
  ): Promise<{ csiIds: string[]; rainbowIds: string[] }> {
    const uniqueIds = [...new Set(batchIds)];

    const alreadyMixedBatchIds = await this.getAlreadyMixedBatchIds();
    const conflicting = uniqueIds.filter((id) => alreadyMixedBatchIds.includes(id));
    if (conflicting.length > 0) {
      throw new BadRequestException(
        'One or more pyrolysis batches have already been mixed and cannot be reused.',
      );
    }

    const { data: rainbowRows, error: rainbowError } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .select(
        `
        id,
        kontikki_id,
        submission_status,
        rainbow_pyrolysis_sessions!inner (status)
      `,
      )
      .in('id', uniqueIds);

    if (rainbowError) throw new BadRequestException(rainbowError.message);

    const rainbowIds = (rainbowRows ?? []).map((row) => String(row.id));
    const csiIds = uniqueIds.filter((id) => !rainbowIds.includes(id));

    for (const row of rainbowRows ?? []) {
      const session = row.rainbow_pyrolysis_sessions as { status?: string } | null;
      if (row.submission_status !== 'submitted' || session?.status !== 'completed') {
        throw new BadRequestException(
          'Only completed Rainbow kiln runs can be linked to mixing.',
        );
      }
      if (!allowedKontikkiIds.has(String(row.kontikki_id))) {
        throw new ForbiddenException(
          'One or more pyrolysis batches are outside your assigned network.',
        );
      }
    }

    if (csiIds.length > 0) {
      const { data, error } = await this.supabase
        .from('csi_pyrolysis_batches')
        .select(
          `
          id,
          kontikki_id,
          pyrolysis_completed,
          csi_pyrolysis_sessions!inner (status)
        `,
        )
        .in('id', csiIds);

      if (error) throw new BadRequestException(error.message);
      if ((data ?? []).length !== csiIds.length) {
        throw new BadRequestException('One or more pyrolysis batches were not found.');
      }

      for (const row of data ?? []) {
        const session = row.csi_pyrolysis_sessions as { status?: string } | null;
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

    return { csiIds, rainbowIds };
  }

  private async fetchLinkMeta(batchIds: string[]) {
    if (batchIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('csi_pyrolysis_batches')
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

  private async fetchRainbowLinkMeta(batchIds: string[]) {
    if (batchIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .select(
        `
        id,
        batch_number,
        kontikki_code,
        producer_name
      `,
      )
      .in('id', batchIds);

    if (error) throw new BadRequestException(error.message);

    const map = new Map<
      string,
      { kontikki_code?: string | null; batch_number?: string | null; producer_name?: string | null }
    >();
    for (const row of data ?? []) {
      map.set(String(row.id), {
        kontikki_code: (row.kontikki_code as string) ?? null,
        batch_number: (row.batch_number as string) ?? null,
        producer_name: (row.producer_name as string) ?? null,
      });
    }
    return map;
  }

  private async loadEntries(
    portal: boolean,
    options: { operatorId?: string; ids?: string[] },
  ): Promise<MixingEntryRecord[] | MixingEntryPortalRecord[]> {
    const lists = await Promise.all(
      MIX_TABLES.map((tables) => this.fetchRegistryEntries(tables, portal, options)),
    );
    return lists
      .flat()
      .sort((left, right) => right.started_at.localeCompare(left.started_at));
  }

  private async findEntry(
    id: string,
    portal: boolean,
    operatorId?: string,
  ): Promise<MixingEntryRecord | MixingEntryPortalRecord | null> {
    const rows = await this.loadEntries(portal, {
      operatorId,
      ids: [id],
    });
    return rows.find((row) => row.id === id) ?? null;
  }

  private async fetchRegistryEntries(
    tables: MixTables,
    portal: boolean,
    options: { operatorId?: string; ids?: string[] },
  ): Promise<Array<MixingEntryRecord | MixingEntryPortalRecord>> {
    let query = this.supabase
      .from(tables.entries)
      .select(entrySelect(tables, portal))
      .order('started_at', { ascending: false });
    if (options.operatorId) query = query.eq('operator_id', options.operatorId);
    if (options.ids) query = query.in('id', options.ids);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return rows.map((row) => {
      const shaped = this.shapeEntry(row, tables);
      return portal
        ? this.mapPortalEntryRow(shaped, tables.registry)
        : this.mapEntryRow(shaped, tables.registry);
    });
  }

  private shapeEntry(row: Record<string, unknown>, tables: MixTables): Record<string, unknown> {
    const statusRaw = row[tables.status];
    const status = Array.isArray(statusRaw) ? statusRaw[0] : statusRaw;
    if (status && typeof status === 'object') {
      const record = status as Record<string, unknown>;
      record.mixing_entry_photo_flags = record[tables.flags] ?? [];
    }
    return {
      ...row,
      mixing_pyrolysis_links: row[tables.links] ?? [],
      mixing_entry_status: status ?? null,
    };
  }

  private async registryForEntry(entryId: string): Promise<MixTables> {
    for (const tables of MIX_TABLES) {
      const { data, error } = await this.supabase
        .from(tables.entries)
        .select('id')
        .eq('id', entryId)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (data) return tables;
    }
    throw new NotFoundException('Mixing entry not found.');
  }

  private sessionStatus(row: Record<string, unknown>, sessionKey: string): string | undefined {
    const session = row[sessionKey] as { status?: string } | { status?: string }[] | null;
    if (Array.isArray(session)) return session[0]?.status;
    return session?.status;
  }

  private mapEntryRow(
    row: Record<string, unknown>,
    protocol: MixRegistry = 'csi',
  ): MixingEntryRecord {
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
          protocol,
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

  private mapAvailableBatchRow(
    row: Record<string, unknown>,
    protocol: 'csi' | 'rainbow',
  ): AvailableMixingPyrolysisBatch {
    const session = (row[protocol === 'rainbow' ? 'rainbow_pyrolysis_sessions' : 'csi_pyrolysis_sessions'] ??
      row.pyrolysis_sessions) as {
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
      protocol,
    };
  }

  private mapPortalEntryRow(
    row: Record<string, unknown>,
    protocol: MixRegistry = 'csi',
  ): MixingEntryPortalRecord {
    const operator = this.unwrap(row.users) as { full_name?: string | null } | null;
    const base = this.mapEntryRow(row, protocol);

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
