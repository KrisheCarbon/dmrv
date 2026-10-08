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
  pyrolysisProtocolForRegistry,
  type FarmUpsertPayload,
  type Farmer,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import type { AuthenticatedUser } from '../auth/auth.types';

const FARM_SELECT = '*, cluster:clusters(id, name)';

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

    const { data, error } = await this.supabase
      .from('farms')
      .insert({
        ...payload,
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

    const { data, error } = await this.supabase
      .from('farms')
      .update({
        ...payload,
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
