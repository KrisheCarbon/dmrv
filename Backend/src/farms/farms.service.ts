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
  canAccessWebPortal,
  isDmrvViewer,
  normalizeIndianMobile,
  pyrolysisProtocolForRegistry,
  type FarmUpsertPayload,
  type Farmer,
  type PagedResult,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import type { AuthenticatedUser } from '../auth/auth.types';

const FARM_SELECT = '*, cluster:clusters(id, name)';

const PAGE_SIZES = [10, 25, 50, 100];

/** Portal column → farms column it sorts on. */
const FARM_SORT_COLUMNS: Record<string, string> = {
  name: 'farmer_name',
  mobile: 'mobile_number',
  village: 'village',
  state: 'state',
  farmerOnboarded: 'created_at',
  totalAcres: 'total_land_size',
};

export type FarmFilterKey = 'name' | 'mobile' | 'location' | 'state';

const FARM_FILTER_COLUMNS: Record<FarmFilterKey, string> = {
  name: 'farmer_name',
  mobile: 'mobile_number',
  location: 'village',
  state: 'state',
};

@Injectable()
export class FarmsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async findAll(user: AuthenticatedUser): Promise<Farmer[]> {
    if (isDmrvViewer(user.role)) {
      const mixingIds = await this.mixingFarmIds();
      const rows = await fetchAllPages<Farmer>((from, to) =>
        this.supabase
          .from('farms')
          .select(FARM_SELECT)
          .order('created_at', { ascending: false })
          .range(from, to),
      );
      return rows
        .filter((row) => mixingIds.has(row.id))
        .map((row) => this.withCluster(row));
    }

    const seeAll = canAccessWebPortal(user.role);

    const rows = await fetchAllPages<Farmer>((from, to) => {
      let query = this.supabase
        .from('farms')
        .select(FARM_SELECT)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!seeAll) {
        query = query.or(
          `created_by.eq.${user.id},assigned_to.eq.${user.id}`,
        );
      }

      return query;
    });

    return rows.map((row) => this.withCluster(row));
  }

  /**
   * One page of farmers, searched and sorted on the server, so the portal
   * never loads every farmer at once.
   */
  async findPage(
    user: AuthenticatedUser,
    query: {
      page: number;
      pageSize: number;
      sort?: string;
      dir?: string;
      filters: Partial<Record<FarmFilterKey, string>>;
    },
  ): Promise<PagedResult<Farmer>> {
    const pageSize = PAGE_SIZES.includes(query.pageSize) ? query.pageSize : 10;
    const page = Math.max(1, Math.floor(query.page) || 1);
    const sortColumn = FARM_SORT_COLUMNS[query.sort ?? ''] ?? 'created_at';
    const ascending = query.dir === 'asc';

    let request = this.supabase
      .from('farms')
      .select(FARM_SELECT, { count: 'exact' })
      .order(sortColumn, { ascending, nullsFirst: false })
      .order('id', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (isDmrvViewer(user.role)) {
      const mixingIds = [...(await this.mixingFarmIds())];
      if (mixingIds.length === 0) return { rows: [], total: 0, page, pageSize };
      request = request.in('id', mixingIds);
    } else if (!canAccessWebPortal(user.role)) {
      request = request.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
    }

    for (const [key, raw] of Object.entries(query.filters)) {
      // Keep only characters that are safe inside a PostgREST filter.
      const term = String(raw ?? '').replace(/[^\p{L}\p{N} .@+-]/gu, '').trim();
      if (!term) continue;
      if (key === 'location') {
        request = request.or(
          ['village', 'mandal', 'district', 'address']
            .map((column) => `${column}.ilike."*${term}*"`)
            .join(','),
        );
      } else {
        request = request.ilike(FARM_FILTER_COLUMNS[key as FarmFilterKey], `%${term}%`);
      }
    }

    const { data, error, count } = await request;
    if (error) throw new BadRequestException(error.message);
    return {
      rows: ((data ?? []) as Farmer[]).map((row) => this.withCluster(row)),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async findById(user: AuthenticatedUser, id: string): Promise<Farmer> {
    const { data, error } = await this.supabase
      .from('farms')
      .select(FARM_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Farm not found');
    }

    const farm = this.withCluster(data as Farmer);
    if (isDmrvViewer(user.role)) {
      const mixingIds = await this.mixingFarmIds();
      if (!mixingIds.has(farm.id)) {
        throw new ForbiddenException('This farm has no mixing record.');
      }
      return farm;
    }
    if (!this.canViewFarm(user, farm)) {
      throw new ForbiddenException('Not allowed to view this farm');
    }

    return farm;
  }

  async create(
    user: AuthenticatedUser,
    payload: FarmUpsertPayload,
  ): Promise<Farmer> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to create farms');
    }

    const location = await this.resolveVillageAssignment(user, payload, true);
    await this.assertRainbowFarmer(payload, location.cluster_id);
    const mobile = await this.uniqueMobile(payload.mobile_number);

    const { data, error } = await this.supabase
      .from('farms')
      .insert({
        ...payload,
        ...(mobile ? { mobile_number: mobile } : {}),
        created_by: user.id,
        assigned_to: user.id,
        farmer_code: payload.farmer_code ?? null,
        father_spouse_name: payload.father_spouse_name ?? null,
        agri_id: payload.agri_id ?? null,
        owned_land_size: payload.owned_land_size ?? null,
        leased_land_size: payload.leased_land_size ?? null,
        farmer_photo_url: payload.farmer_photo_url ?? null,
        ...location,
      })
      .select(FARM_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.withCluster(data as Farmer);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: FarmUpsertPayload,
  ): Promise<Farmer> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to update farms');
    }

    const location = await this.resolveVillageAssignment(user, payload, false);
    await this.assertRainbowFarmer(payload, location.cluster_id);
    const mobile =
      payload.mobile_number === undefined
        ? null
        : await this.uniqueMobile(payload.mobile_number, id);

    const { data, error } = await this.supabase
      .from('farms')
      .update({
        ...payload,
        ...(mobile ? { mobile_number: mobile } : {}),
        ...location,
      })
      .eq('id', id)
      .select(FARM_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Farm not found');
    }

    return this.withCluster(data as Farmer);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to delete farms');
    }

    const { error } = await this.supabase.from('farms').delete().eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  /** Farmers already registered with this mobile number, in any format. */
  private async farmsWithMobile(mobile: string, excludeId?: string) {
    const head = mobile.slice(0, 5);
    const tail = mobile.slice(5);
    // Older rows may hold "+91…", "0…" or a spaced number; match the last
    // ten digits loosely, then compare exactly after normalizing.
    const { data, error } = await this.supabase
      .from('farms')
      .select('id, farmer_name, farmer_code, village, mobile_number')
      .or(
        [
          `mobile_number.ilike.*${mobile}`,
          `mobile_number.ilike."*${head} ${tail}"`,
          `mobile_number.ilike.*${head}-${tail}`,
        ].join(','),
      )
      .limit(50);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).filter(
      (row) =>
        row.id !== excludeId &&
        normalizeIndianMobile(row.mobile_number as string | null) === mobile,
    );
  }

  /** The 10-digit number to store, after checking no other farmer has it. */
  private async uniqueMobile(
    raw: string | null | undefined,
    excludeId?: string,
  ): Promise<string | null> {
    if (!String(raw ?? '').trim()) return null;
    const mobile = normalizeIndianMobile(raw);
    if (!mobile) {
      throw new BadRequestException(
        'Enter a valid 10-digit mobile number (optionally with +91).',
      );
    }
    const taken = await this.farmsWithMobile(mobile, excludeId);
    if (taken.length > 0) {
      const other = taken[0];
      throw new BadRequestException(
        `Mobile number ${mobile} is already registered to ${other.farmer_name || 'another farmer'}${other.village ? ` (${other.village})` : ''}.`,
      );
    }
    return mobile;
  }

  /** Lets the app warn before saving; the create/update check is the real guard. */
  async mobileAvailability(
    user: AuthenticatedUser,
    raw: string,
    excludeId?: string,
  ): Promise<{ valid: boolean; taken: boolean; farmer_name?: string | null; village?: string | null }> {
    if (!canAccessMobileApp(user.role) && !canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to check farmers');
    }
    const mobile = normalizeIndianMobile(raw);
    if (!mobile) return { valid: false, taken: false };
    const taken = await this.farmsWithMobile(mobile, excludeId);
    return taken.length
      ? {
          valid: true,
          taken: true,
          farmer_name: (taken[0].farmer_name as string | null) ?? null,
          village: (taken[0].village as string | null) ?? null,
        }
      : { valid: true, taken: false };
  }

  private async mixingFarmIds(): Promise<Set<string>> {
    const [csi, rainbow] = await Promise.all([
      fetchAllPages<{ farm_id: string | null }>((from, to) =>
        this.supabase
          .from('csi_mixing_entries')
          .select('farm_id')
          .not('farm_id', 'is', null)
          .range(from, to),
      ),
      fetchAllPages<{ farm_id: string | null }>((from, to) =>
        this.supabase
          .from('rainbow_mixing_entries')
          .select('farm_id')
          .not('farm_id', 'is', null)
          .range(from, to),
      ),
    ]);
    return new Set(
      [...csi, ...rainbow]
        .map((row) => row.farm_id)
        .filter((id): id is string => Boolean(id)),
    );
  }

  private canViewFarm(user: AuthenticatedUser, farm: Farmer): boolean {
    if (canAccessWebPortal(user.role)) {
      return true;
    }

    return farm.created_by === user.id || farm.assigned_to === user.id;
  }

  private withCluster(row: Farmer): Farmer {
    const clusterRaw = (row as Farmer & {
      cluster?: { id?: string; name?: string | null } | Array<{
        id?: string;
        name?: string | null;
      }> | null;
    }).cluster;
    const cluster = Array.isArray(clusterRaw) ? clusterRaw[0] : clusterRaw;
    return {
      ...row,
      cluster: cluster?.id
        ? { id: cluster.id, name: cluster.name?.trim() || 'Unnamed cluster' }
        : null,
    };
  }

  private async resolveVillageAssignment(
    user: AuthenticatedUser,
    payload: FarmUpsertPayload,
    required: boolean,
  ): Promise<{
    cluster_id: string | null;
    cluster_village_id: string | null;
    village: string | null;
    mandal: string | null;
    district: string | null;
    state: string | null;
  }> {
    const villageId = payload.cluster_village_id?.trim() || '';
    if (!villageId) {
      if (required) {
        throw new BadRequestException(
          'Select a village from your assigned cluster.',
        );
      }
      return {
        cluster_id: payload.cluster_id ?? null,
        cluster_village_id: payload.cluster_village_id ?? null,
        village: payload.village ?? null,
        mandal: payload.mandal ?? null,
        district: payload.district ?? null,
        state: payload.state ?? null,
      };
    }

    const { data, error } = await this.supabase
      .from('cluster_villages')
      .select('id, cluster_id, village_name, mandal, district, state')
      .eq('id', villageId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new BadRequestException('Selected village was not found.');
    }

    await this.assertCanUseCluster(user, data.cluster_id as string);

    return {
      cluster_id: data.cluster_id as string,
      cluster_village_id: data.id as string,
      village: data.village_name as string,
      mandal: (data.mandal as string | null) ?? null,
      district: (data.district as string | null) ?? null,
      state: (data.state as string | null) ?? null,
    };
  }

  private async assertRainbowFarmer(
    payload: FarmUpsertPayload,
    clusterId: string | null,
  ) {
    if (!clusterId) return;
    const { data, error } = await this.supabase
      .from('biochar_producer_clusters')
      .select('biochar_producers(registry)')
      .eq('cluster_id', clusterId);
    if (error) throw new BadRequestException(error.message);

    const rainbow = (data ?? []).some((row) => {
      const producerRaw = row.biochar_producers as
        | { registry?: string | null }
        | { registry?: string | null }[]
        | null;
      const producer = Array.isArray(producerRaw) ? producerRaw[0] : producerRaw;
      return pyrolysisProtocolForRegistry(producer?.registry) === 'rainbow';
    });
    if (!rainbow) return;

    if (!payload.farmer_photo_url) {
      throw new BadRequestException('A Rainbow farmer record needs a photo.');
    }
    if (!payload.credit_rights_acknowledged) {
      throw new BadRequestException(
        'Rainbow farmers must confirm this project holds the sole right to issue carbon credits for biochar from this farm.',
      );
    }
  }

  private async assertCanUseCluster(
    user: AuthenticatedUser,
    clusterId: string,
  ): Promise<void> {
    if (canAccessNetwork(user.role)) return;

    const isSupervisor = user.role === 'supervisor';
    const isClimapreneur = user.role === 'climapreneur';
    if (!isSupervisor && !isClimapreneur) {
      throw new ForbiddenException(
        'You can only onboard farmers in clusters assigned to you.',
      );
    }

    const table = isSupervisor ? 'cluster_supervisors' : 'cluster_climapreneurs';
    const column = isSupervisor ? 'supervisor_id' : 'climapreneur_id';
    const { data, error } = await this.supabase
      .from(table)
      .select('cluster_id')
      .eq('cluster_id', clusterId)
      .eq(column, user.id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new ForbiddenException(
        'You can only onboard farmers in clusters assigned to you.',
      );
    }
  }
}
