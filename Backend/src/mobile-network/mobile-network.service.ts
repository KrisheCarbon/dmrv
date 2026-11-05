import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  canAccessNetwork,
  canAccessWebPortal,
  contactEmail,
  parseBoundaryGeojson,
  polygonAreaAcres,
  type ApplicationFarmerOption,
  type ApplicationFarmFieldOption,
  type BiomassFarmOption,
  type GeoPoint,
  type UserRole,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  assignedFieldClusterIds,
  farmVisibilityFilter,
  seesEveryFarm,
} from '../farms/farm-visibility';

export interface MobileNetworkPerson {
  id: string;
  full_name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

export interface MobileNetworkProducer {
  id: string;
  name: string;
  producer_code?: string | null;
  status?: string | null;
  contact_name?: string | null;
  mobile_number?: string | null;
  registry?: string | null;
}

/** A dropping site recorded on a producer. Biomass is unloaded at one of these. */
export interface MobileNetworkSite {
  id: string;
  site_name: string;
  biochar_producer_id: string;
  producer_name: string | null;
}

export interface MobileNetworkKontikki {
  id: string;
  kontikki_code: string;
  module_id?: string | null;
  status: string;
  capacity?: number | null;
  biochar_producer_id?: string | null;
  producer?: MobileNetworkProducer | null;
  operators?: MobileNetworkPerson[];
}

export interface MobileNetworkFeedstock {
  id: string;
  biomass_type: string;
  lab_status: string;
  biochar_producer_id: string;
  producer?: MobileNetworkProducer | null;
}

export interface MobileNetworkFarm {
  id: string;
  farmer_name: string;
  address?: string | null;
  mobile_number?: string | null;
  village?: string | null;
  cluster_name?: string | null;
}

export interface MobileNetworkOverview {
  role: string;
  producers: MobileNetworkProducer[];
  sites: MobileNetworkSite[];
  kontikkis: MobileNetworkKontikki[];
  supervisors: MobileNetworkPerson[];
  climapreneurs: MobileNetworkPerson[];
  feedstock: MobileNetworkFeedstock[];
  farms: MobileNetworkFarm[];
}

/** Basics the phone keeps on device. Full records are fetched when one is opened. */
export interface MobileDirectoryFarmer {
  id: string;
  farmer_name: string;
  village: string | null;
  district: string | null;
  mobile_number: string | null;
  created_by: string | null;
  cluster_id: string | null;
}

export interface MobileDirectoryFarm {
  id: string;
  farmer_id: string;
  area: number | null;
}

export interface MobileDirectoryKontikki {
  id: string;
  registry_name: string | null;
  volume: number | null;
}

export interface MobileDirectory {
  farmers: MobileDirectoryFarmer[];
  farms: MobileDirectoryFarm[];
  kontikkis: MobileDirectoryKontikki[];
}

const PRODUCER_SELECT = `
  id,
  name,
  producer_code,
  status,
  contact_name,
  mobile_number,
  registry
`;

const KONTIKKI_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  capacity,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code,
    status,
    contact_name,
    mobile_number,
    registry
  ),
  kontikki_operators (
    operator_id,
    users (
      id,
      full_name,
      role,
      email,
      phone
    )
  )
`;

const FARM_LIST_SELECT =
  'id, farmer_name, address, mobile_number, village, cluster_id, cluster:clusters(id, name)';

@Injectable()
export class MobileNetworkService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /** Onboarded farms that have a mapped plot, scoped the same way as the network overview. */
  async listMappedFarms(user: AuthenticatedUser): Promise<BiomassFarmOption[]> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const farms = await this.farmsForUser(user);
    const boundaries = await this.boundariesForFarms(farms.map((farm) => farm.id));

    return farms.flatMap((farm) => {
      const rings = boundaries.get(farm.id) ?? [];
      if (rings.length === 0) return [];
      return [
        {
          id: farm.id,
          farmer_name: farm.farmer_name,
          village: farm.village ?? null,
          cluster_name: farm.cluster_name ?? null,
          boundaries: rings,
        },
      ];
    });
  }

  /** Names of farmers in this person's clusters who have a mapped farm. No plot geometry. */
  async listFarmerNames(user: AuthenticatedUser): Promise<
    Array<{
      id: string;
      farmer_name: string;
      village: string | null;
      cluster_name: string | null;
    }>
  > {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const [farms, mapped] = await Promise.all([
      this.farmsForPicker(user),
      this.mappedFarmIdSet(),
    ]);
    return farms
      .filter((farm) => mapped.has(farm.id))
      .map((farm) => ({
        id: farm.id,
        farmer_name: farm.farmer_name,
        village: farm.village ?? null,
        cluster_name: farm.cluster_name ?? null,
      }));
  }

  /** Mapped plots for one farmer, after that farmer has been chosen. */
  async listFarmerFields(
    user: AuthenticatedUser,
    farmId: string,
  ): Promise<ApplicationFarmFieldOption[]> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const visible = await this.pickerCanSeeFarm(user, farmId);
    if (!visible) {
      throw new ForbiddenException('That farmer is not in your clusters.');
    }
    const fields = await this.fetchApplicationFields([farmId]);
    return fields.get(farmId) ?? [];
  }

  /** Dropping sites on the producers linked to this person's clusters. */
  async listDropSites(user: AuthenticatedUser): Promise<MobileNetworkSite[]> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }
    const producerIds = await this.producerIdsForUser(user);
    return this.fetchSites(producerIds ?? undefined);
  }

  /** Onboarded farmers and each mapped plot, for biomass collection and biochar application. */
  async listApplicationFarms(user: AuthenticatedUser): Promise<ApplicationFarmerOption[]> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const farms = await this.farmsForUser(user);
    const fieldsByFarm = await this.fetchApplicationFields(farms.map((farm) => farm.id));

    return farms.flatMap((farm) => {
      const fields = fieldsByFarm.get(farm.id) ?? [];
      if (fields.length === 0) return [];
      return [
        {
          id: farm.id,
          farmer_name: farm.farmer_name,
          village: farm.village ?? null,
          cluster_name: farm.cluster_name ?? null,
          fields,
        },
      ];
    });
  }

  async getOverview(user: AuthenticatedUser): Promise<MobileNetworkOverview> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    if (canAccessNetwork(user.role)) {
      return this.getAdminOverview(user.role);
    }

    if (user.role === 'supervisor') {
      return this.getSupervisorOverview(user);
    }

    if (user.role === 'climapreneur') {
      return this.getClimapreneurOverview(user);
    }

    throw new ForbiddenException('Not allowed to view network assignments');
  }

  /**
   * The short list the phone stores and refreshes. Farmer name, village,
   * district, and mobile; each plot's id and area; each kontikki's id,
   * registry, and volume. No addresses, photos, or boundaries.
   */
  async getDirectory(user: AuthenticatedUser): Promise<MobileDirectory> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const farmers = await this.fetchDirectoryFarmers(user);
    const [farms, kontikkis] = await Promise.all([
      this.fetchDirectoryFarms(
        canAccessWebPortal(user.role) ? null : farmers.map((farmer) => farmer.id),
      ),
      this.fetchDirectoryKontikkis(user),
    ]);

    return { farmers, farms, kontikkis };
  }

  private async fetchDirectoryFarmers(
    user: AuthenticatedUser,
  ): Promise<MobileDirectoryFarmer[]> {
    const seeAll = seesEveryFarm(user.role);
    const visibility = seeAll
      ? ''
      : farmVisibilityFilter(
          user.id,
          await assignedFieldClusterIds(this.supabase, user),
        );
    const rows = await fetchAllPages<{
      id: string;
      farmer_name: string | null;
      village: string | null;
      district: string | null;
      mobile_number: string | null;
      created_by: string | null;
      cluster_id: string | null;
    }>((from, to) => {
      let query = this.supabase
        .from('farms')
        .select('id, farmer_name, village, district, mobile_number, created_by, cluster_id')
        .order('farmer_name', { ascending: true })
        .range(from, to);

      if (!seeAll) {
        query = query.or(visibility);
      }

      return query;
    });

    return rows.map((row) => ({
      id: row.id,
      farmer_name: row.farmer_name?.trim() || 'Unnamed farmer',
      village: row.village ?? null,
      district: row.district ?? null,
      mobile_number: row.mobile_number ?? null,
      created_by: row.created_by ?? null,
      cluster_id: row.cluster_id ?? null,
    }));
  }

  /** Plot id, the farmer it belongs to, and area. No boundary. */
  private async fetchDirectoryFarms(
    farmerIds: string[] | null,
  ): Promise<MobileDirectoryFarm[]> {
    if (farmerIds && farmerIds.length === 0) return [];
    if (farmerIds && farmerIds.length > 200) {
      const pages: MobileDirectoryFarm[] = [];
      for (let index = 0; index < farmerIds.length; index += 200) {
        pages.push(
          ...(await this.fetchDirectoryFarms(farmerIds.slice(index, index + 200))),
        );
      }
      return pages;
    }

    const rows = await fetchAllPages<{
      id: string;
      farm_id: string;
      calculated_area: number | null;
    }>((from, to) => {
      let query = this.supabase
        .from('farm_fields')
        .select('id, farm_id, calculated_area')
        .order('id', { ascending: true })
        .range(from, to);
      if (farmerIds) query = query.in('farm_id', farmerIds);
      return query;
    });

    return rows.map((row) => ({
      id: row.id,
      farmer_id: row.farm_id,
      area: row.calculated_area == null ? null : Number(row.calculated_area),
    }));
  }

  private async fetchDirectoryKontikkis(
    user: AuthenticatedUser,
  ): Promise<MobileDirectoryKontikki[]> {
    if (canAccessNetwork(user.role)) {
      return this.queryDirectoryKontikkis();
    }
    if (user.role === 'supervisor') {
      const producerIds = (await this.producerIdsForUser(user)) ?? [];
      return this.queryDirectoryKontikkis(producerIds);
    }
    if (user.role === 'climapreneur') {
      const kontikkiIds = await this.fetchKontikkiIdsForOperator(user.id);
      return this.queryDirectoryKontikkis(undefined, kontikkiIds);
    }
    return [];
  }

  private async queryDirectoryKontikkis(
    producerIds?: string[],
    kontikkiIds?: string[],
  ): Promise<MobileDirectoryKontikki[]> {
    if (kontikkiIds && kontikkiIds.length === 0) return [];
    if (!kontikkiIds && producerIds && producerIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('kontikkis')
        .select(
          `
          id,
          capacity,
          biochar_producer:biochar_producers ( registry )
        `,
        )
        .order('id', { ascending: true })
        .range(from, to);

      if (kontikkiIds) query = query.in('id', kontikkiIds);
      else if (producerIds) query = query.in('biochar_producer_id', producerIds);

      return query;
    });

    return rows.map((row) => {
      const producerRaw = row.biochar_producer;
      const producer = Array.isArray(producerRaw) ? producerRaw[0] : producerRaw;
      const registry =
        producer && typeof producer === 'object'
          ? ((producer as { registry?: string | null }).registry ?? null)
          : null;
      const capacity = row.capacity;
      return {
        id: row.id as string,
        registry_name: registry,
        volume: capacity == null ? null : Number(capacity),
      };
    });
  }

  private async getAdminOverview(role: string): Promise<MobileNetworkOverview> {
    const [producers, sites, kontikkis, supervisors, climapreneurs, feedstock, farms] =
      await Promise.all([
        this.fetchProducers(),
        this.fetchSites(),
        this.fetchKontikkis(),
        this.fetchUsersByRole('supervisor'),
        this.fetchUsersByRole('climapreneur'),
        this.fetchFeedstock(),
        this.fetchAllFarms(),
      ]);

    return {
      role,
      producers,
      sites,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async getSupervisorOverview(
    user: AuthenticatedUser,
  ): Promise<MobileNetworkOverview> {
    const producerIds = await this.producerIdsForUser(user);
    return this.buildScopedOverview(user.role, producerIds ?? []);
  }

  private async getClimapreneurOverview(
    user: AuthenticatedUser,
  ): Promise<MobileNetworkOverview> {
    const kontikkiIds = await this.fetchKontikkiIdsForOperator(user.id);
    const producerIds = await this.producerIdsForUser(user);
    return this.buildKontikkiScopedOverview(user.role, kontikkiIds, producerIds ?? []);
  }

  /**
   * Producers a field user can work with. Null means every producer.
   * A cluster assignment reaches the producer that cluster is linked to,
   * in addition to a direct supervisor or kontikki assignment.
   */
  async producerIdsForUser(user: AuthenticatedUser): Promise<string[] | null> {
    if (canAccessNetwork(user.role)) return null;
    if (user.role !== 'supervisor' && user.role !== 'climapreneur') return [];

    const clusterProducerIds = await this.fetchProducerIdsForClusters(
      await this.fetchAssignedClusterIds(user),
    );

    if (user.role === 'supervisor') {
      return this.uniqueIds([
        ...(await this.fetchProducerIdsForSupervisor(user.id)),
        ...(await this.fetchProducerIdsForAssignedKontikkis(user.id)),
        ...clusterProducerIds,
      ]);
    }

    const kontikkiIds = await this.fetchKontikkiIdsForOperator(user.id);
    const kontikkis = await this.fetchKontikkis(undefined, kontikkiIds);
    return this.uniqueIds([
      ...kontikkis.map((kontikki) => kontikki.biochar_producer_id),
      ...clusterProducerIds,
    ]);
  }

  private async buildScopedOverview(
    role: string,
    producerIds: string[],
  ): Promise<MobileNetworkOverview> {
    const producers = await this.fetchProducers(producerIds);
    const sites = await this.fetchSites(producerIds);
    const kontikkis = await this.fetchKontikkis(producerIds);
    const climapreneurs = this.collectOperators(kontikkis);
    const supervisors = await this.fetchSupervisorsForProducers(producerIds);
    const [feedstock, farms] = await Promise.all([
      this.fetchFeedstock(producerIds),
      this.fetchFarmsForProducers(producerIds),
    ]);

    return {
      role,
      producers,
      sites,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async buildKontikkiScopedOverview(
    role: string,
    kontikkiIds: string[],
    producerIds: string[],
  ): Promise<MobileNetworkOverview> {
    const kontikkis = await this.fetchKontikkis(undefined, kontikkiIds);
    const producers = await this.fetchProducers(producerIds);
    const sites = await this.fetchSites(producerIds);
    const climapreneurs = this.collectOperators(kontikkis);
    const supervisors = await this.fetchSupervisorsForProducers(producerIds);
    const [feedstock, farms] = await Promise.all([
      this.fetchFeedstock(producerIds),
      this.fetchFarmsForProducers(producerIds),
    ]);

    return {
      role,
      producers,
      sites,
      kontikkis,
      supervisors,
      climapreneurs,
      feedstock,
      farms,
    };
  }

  private async fetchProducerIdsForSupervisor(
    supervisorId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('biochar_producer_id')
      .eq('supervisor_id', supervisorId);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => row.biochar_producer_id as string);
  }

  private async fetchKontikkiIdsForOperator(
    operatorId: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('kontikki_operators')
      .select('kontikki_id')
      .eq('operator_id', operatorId);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => row.kontikki_id as string);
  }

  private uniqueIds(ids: Array<string | null | undefined>): string[] {
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  }

  private async fetchProducerIdsForAssignedKontikkis(
    operatorId: string,
  ): Promise<string[]> {
    const kontikkiIds = await this.fetchKontikkiIdsForOperator(operatorId);
    if (kontikkiIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('kontikkis')
      .select('biochar_producer_id')
      .in('id', kontikkiIds);

    if (error) throw new BadRequestException(error.message);
    return this.uniqueIds(
      (data ?? []).map((row) => row.biochar_producer_id as string | null),
    );
  }

  private async fetchProducerIdsForClusters(clusterIds: string[]): Promise<string[]> {
    if (clusterIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('biochar_producer_clusters')
      .select('biochar_producer_id')
      .in('cluster_id', clusterIds);

    if (error) throw new BadRequestException(error.message);
    return this.uniqueIds(
      (data ?? []).map((row) => row.biochar_producer_id as string | null),
    );
  }

  private async fetchSites(producerIds?: string[]): Promise<MobileNetworkSite[]> {
    if (producerIds && producerIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('producer_sites')
        .select(
          `
          id,
          site_name,
          biochar_producer_id,
          biochar_producer:biochar_producers ( name )
        `,
        )
        .order('site_name', { ascending: true })
        .range(from, to);

      if (producerIds) query = query.in('biochar_producer_id', producerIds);
      return query;
    });

    return rows.flatMap((row) => {
      const id = row.id as string | null;
      const producerId = row.biochar_producer_id as string | null;
      const siteName = (row.site_name as string | null)?.trim();
      if (!id || !producerId || !siteName) return [];
      const producerRaw = row.biochar_producer as
        | { name?: string | null }
        | Array<{ name?: string | null }>
        | null;
      const producer = Array.isArray(producerRaw) ? producerRaw[0] : producerRaw;
      return [
        {
          id,
          site_name: siteName,
          biochar_producer_id: producerId,
          producer_name: producer?.name?.trim() || null,
        },
      ];
    });
  }

  private async fetchProducers(ids?: string[]): Promise<MobileNetworkProducer[]> {
    if (ids && ids.length === 0) return [];

    return fetchAllPages<MobileNetworkProducer>((from, to) => {
      let query = this.supabase
        .from('biochar_producers')
        .select(PRODUCER_SELECT)
        .order('name', { ascending: true })
        .range(from, to);

      if (ids) {
        query = query.in('id', ids);
      }

      return query;
    });
  }

  private async fetchKontikkis(
    producerIds?: string[],
    kontikkiIds?: string[],
  ): Promise<MobileNetworkKontikki[]> {
    if (kontikkiIds && kontikkiIds.length === 0) return [];
    if (!kontikkiIds && producerIds && producerIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('kontikkis')
        .select(KONTIKKI_SELECT)
        .order('kontikki_code', { ascending: true })
        .range(from, to);

      if (kontikkiIds) {
        query = query.in('id', kontikkiIds);
      } else if (producerIds) {
        query = query.in('biochar_producer_id', producerIds);
      }

      return query;
    });

    return rows.map((row) => this.mapKontikki(row));
  }

  private mapKontikki(row: Record<string, unknown>): MobileNetworkKontikki {
    const producerRaw = row.biochar_producer;
    const producer = Array.isArray(producerRaw)
      ? (producerRaw[0] as MobileNetworkProducer | undefined) ?? null
      : (producerRaw as MobileNetworkProducer | null);

    const operatorRows = Array.isArray(row.kontikki_operators)
      ? (row.kontikki_operators as Array<{
          users?: MobileNetworkPerson | MobileNetworkPerson[] | null;
        }>)
      : [];

    const operators: MobileNetworkPerson[] = operatorRows
      .map((assignment) => {
        const user = Array.isArray(assignment.users)
          ? assignment.users[0]
          : assignment.users;
        if (!user?.id) return null;
        return {
          id: user.id,
          full_name: user.full_name?.trim() || 'Unnamed',
          role: user.role || 'climapreneur',
          email: contactEmail(user.email),
          phone: user.phone ?? null,
        };
      })
      .filter((person): person is NonNullable<typeof person> => person !== null);

    return {
      id: row.id as string,
      kontikki_code: row.kontikki_code as string,
      module_id: (row.module_id as string | null) ?? null,
      status: row.status as string,
      capacity: (row.capacity as number | null) ?? null,
      biochar_producer_id: (row.biochar_producer_id as string | null) ?? null,
      producer,
      operators,
    };
  }

  private collectOperators(
    kontikkis: MobileNetworkKontikki[],
  ): MobileNetworkPerson[] {
    const byId = new Map<string, MobileNetworkPerson>();
    for (const kontikki of kontikkis) {
      for (const operator of kontikki.operators ?? []) {
        if (operator.role === 'supervisor') continue;
        byId.set(operator.id, operator);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );
  }

  private async fetchSupervisorsForProducers(
    producerIds: string[],
  ): Promise<MobileNetworkPerson[]> {
    if (producerIds.length === 0) return [];

    const { data: links, error } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('supervisor_id')
      .in('biochar_producer_id', producerIds);

    if (error) throw new BadRequestException(error.message);

    const supervisorIds = [
      ...new Set((links ?? []).map((row) => row.supervisor_id as string)),
    ];

    return this.fetchUsersByIds(supervisorIds);
  }

  private async fetchUsersByRole(role: UserRole): Promise<MobileNetworkPerson[]> {
    const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
      this.supabase
        .from('users')
        .select('id, full_name, role, email, phone')
        .eq('role', role)
        .order('full_name', { ascending: true })
        .range(from, to),
    );

    return rows.map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null)?.trim() || 'Unnamed',
      role: row.role as string,
      email: contactEmail(row.email as string | null),
      phone: (row.phone as string | null) ?? null,
    }));
  }

  private async fetchUsersByIds(ids: string[]): Promise<MobileNetworkPerson[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name, role, email, phone')
      .in('id', ids)
      .order('full_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null)?.trim() || 'Unnamed',
      role: row.role as string,
      email: contactEmail(row.email as string | null),
      phone: (row.phone as string | null) ?? null,
    }));
  }

  /**
   * Farmers a supervisor or climapreneur can pick in biomass collection.
   * Producer links alone hide people who are only assigned to a cluster, which
   * is why the same farmer list showed up for some accounts and not others.
   */
  private async farmsForUser(user: AuthenticatedUser): Promise<MobileNetworkFarm[]> {
    if (canAccessNetwork(user.role)) {
      return this.fetchAllFarms();
    }

    if (user.role !== 'supervisor' && user.role !== 'climapreneur') {
      throw new ForbiddenException('Not allowed to view network assignments');
    }

    const [throughProducers, assignedClusterIds, ownFarms] = await Promise.all([
      this.farmsThroughProducers(user),
      this.fetchAssignedClusterIds(user),
      this.fetchFarmsOwnedBy(user.id),
    ]);
    const clusterFarms = await this.fetchFarms(assignedClusterIds);
    return this.uniqueFarms([...throughProducers, ...clusterFarms, ...ownFarms]);
  }

  private async farmsThroughProducers(
    user: AuthenticatedUser,
  ): Promise<MobileNetworkFarm[]> {
    if (user.role === 'supervisor') {
      const producerIds = this.uniqueIds([
        ...(await this.fetchProducerIdsForSupervisor(user.id)),
        ...(await this.fetchProducerIdsForAssignedKontikkis(user.id)),
      ]);
      return this.fetchFarmsForProducers(producerIds);
    }

    const kontikkiIds = await this.fetchKontikkiIdsForOperator(user.id);
    const kontikkis = await this.fetchKontikkis(undefined, kontikkiIds);
    const producerIds = this.uniqueIds(
      kontikkis.map((kontikki) => kontikki.biochar_producer_id),
    );
    return this.fetchFarmsForProducers(producerIds);
  }

  /** Clusters this person is assigned to, the same link used when onboarding a farmer. */
  private async fetchAssignedClusterIds(user: AuthenticatedUser): Promise<string[]> {
    const table =
      user.role === 'supervisor' ? 'cluster_supervisors' : 'cluster_climapreneurs';
    const column = user.role === 'supervisor' ? 'supervisor_id' : 'climapreneur_id';
    const { data, error } = await this.supabase
      .from(table)
      .select('cluster_id')
      .eq(column, user.id);

    if (error) throw new BadRequestException(error.message);
    return this.uniqueIds((data ?? []).map((row) => row.cluster_id as string | null));
  }

  private uniqueFarms(farms: MobileNetworkFarm[]): MobileNetworkFarm[] {
    const byId = new Map<string, MobileNetworkFarm>();
    for (const farm of farms) byId.set(farm.id, farm);
    return [...byId.values()].sort((a, b) =>
      a.farmer_name.localeCompare(b.farmer_name),
    );
  }

  async boundariesForFarms(farmIds: string[]): Promise<Map<string, GeoPoint[][]>> {
    const ids = [...new Set(farmIds.filter(Boolean))];
    const boundaries = new Map<string, GeoPoint[][]>();
    const chunkSize = 80;

    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize);
      const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
        this.supabase
          .from('farm_fields')
          .select('farm_id, boundary_geojson')
          .eq('status', 'active')
          .in('farm_id', chunk)
          .range(from, to),
      );

      for (const row of rows) {
        const farmId = row.farm_id as string | null;
        if (!farmId) continue;
        const ring = parseBoundaryGeojson(
          row.boundary_geojson as string | Record<string, unknown> | null,
        );
        if (ring.length < 3) continue;
        const list = boundaries.get(farmId) ?? [];
        list.push(ring);
        boundaries.set(farmId, list);
      }
    }

    return boundaries;
  }

  /** Farmers in the clusters this person is assigned to, plus farms they onboarded. */
  private async farmsForPicker(user: AuthenticatedUser): Promise<MobileNetworkFarm[]> {
    if (canAccessNetwork(user.role)) return this.fetchAllFarms();
    if (user.role !== 'supervisor' && user.role !== 'climapreneur') {
      throw new ForbiddenException('Not allowed to view network assignments');
    }
    const [clusterFarms, ownFarms] = await Promise.all([
      this.fetchFarms(await this.fetchAssignedClusterIds(user)),
      this.fetchFarmsOwnedBy(user.id),
    ]);
    return this.uniqueFarms([...clusterFarms, ...ownFarms]);
  }

  private async pickerCanSeeFarm(user: AuthenticatedUser, farmId: string): Promise<boolean> {
    if (canAccessNetwork(user.role)) return true;
    const { data, error } = await this.supabase
      .from('farms')
      .select('id, cluster_id, created_by, assigned_to')
      .eq('id', farmId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) return false;
    if (data.created_by === user.id || data.assigned_to === user.id) return true;
    const clusters = await this.fetchAssignedClusterIds(user);
    return Boolean(data.cluster_id && clusters.includes(data.cluster_id as string));
  }

  /** Farm ids that have a mapped boundary. One pass of ids, not the polygon itself. */
  private async mappedFarmIdSet(): Promise<Set<string>> {
    const found = new Set<string>();
    const rows = await fetchAllPages<{ farm_id: string | null }>((from, to) =>
      this.supabase
        .from('farm_fields')
        .select('farm_id')
        .eq('status', 'active')
        .not('boundary_geojson', 'is', null)
        .range(from, to),
    );
    for (const row of rows) {
      if (row.farm_id) found.add(row.farm_id);
    }
    return found;
  }

  private async fetchApplicationFields(
    farmIds: string[],
  ): Promise<Map<string, ApplicationFarmFieldOption[]>> {
    const ids = [...new Set(farmIds.filter(Boolean))];
    const fields = new Map<string, ApplicationFarmFieldOption[]>();
    const chunkSize = 80;

    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize);
      const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
        this.supabase
          .from('farm_fields')
          .select('id, farm_id, field_code, boundary_geojson')
          .eq('status', 'active')
          .in('farm_id', chunk)
          .order('field_code', { ascending: true })
          .range(from, to),
      );

      for (const row of rows) {
        const farmId = row.farm_id as string | null;
        const fieldId = row.id as string | null;
        if (!farmId || !fieldId) continue;
        const boundary = parseBoundaryGeojson(
          row.boundary_geojson as string | Record<string, unknown> | null,
        );
        if (boundary.length < 3) continue;
        const list = fields.get(farmId) ?? [];
        list.push({
          id: fieldId,
          field_code: (row.field_code as string | null)?.trim() || 'Farm',
          boundary,
          area_acres: polygonAreaAcres(boundary),
        });
        fields.set(farmId, list);
      }
    }

    return fields;
  }

  private async fetchFarmsForProducers(
    producerIds: string[],
  ): Promise<MobileNetworkFarm[]> {
    if (producerIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('biochar_producer_clusters')
      .select('cluster_id')
      .in('biochar_producer_id', producerIds);

    if (error) throw new BadRequestException(error.message);

    const clusterIds = this.uniqueIds(
      (data ?? []).map((row) => row.cluster_id as string | null),
    );
    if (clusterIds.length === 0) return [];

    return this.fetchFarms(clusterIds);
  }

  private async fetchAllFarms(): Promise<MobileNetworkFarm[]> {
    return this.fetchFarms();
  }

  private async fetchFarmsOwnedBy(userId: string): Promise<MobileNetworkFarm[]> {
    const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
      this.supabase
        .from('farms')
        .select(FARM_LIST_SELECT)
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
        .order('farmer_name', { ascending: true })
        .range(from, to),
    );
    return rows.map((row) => this.mapFarm(row));
  }

  private async fetchFarms(clusterIds?: string[]): Promise<MobileNetworkFarm[]> {
    if (clusterIds && clusterIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('farms')
        .select(FARM_LIST_SELECT)
        .order('farmer_name', { ascending: true })
        .range(from, to);

      if (clusterIds) {
        query = query.in('cluster_id', clusterIds);
      }

      return query;
    });

    return rows.map((row) => this.mapFarm(row));
  }

  private mapFarm(row: Record<string, unknown>): MobileNetworkFarm {
    const clusterRaw = row.cluster as
      | { id?: string; name?: string | null }
      | Array<{ id?: string; name?: string | null }>
      | null
      | undefined;
    const cluster = Array.isArray(clusterRaw) ? clusterRaw[0] : clusterRaw;
    return {
      id: row.id as string,
      farmer_name: (row.farmer_name as string | null)?.trim() || 'Unnamed farm',
      address: (row.address as string | null) ?? null,
      mobile_number: (row.mobile_number as string | null) ?? null,
      village: (row.village as string | null) ?? null,
      cluster_name: cluster?.name?.trim() || null,
    };
  }

  private async fetchFeedstock(
    producerIds?: string[],
  ): Promise<MobileNetworkFeedstock[]> {
    if (producerIds && producerIds.length === 0) return [];

    const rows = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = this.supabase
        .from('feedstocks')
        .select(
          `
        id,
        biomass_type,
        lab_status,
        biochar_producer_id,
        biochar_producer:biochar_producers (
          id,
          name,
          producer_code,
          status,
          contact_name,
          mobile_number
        )
      `,
        )
        .is('deleted_at', null)
        .order('biomass_type', { ascending: true })
        .range(from, to);

      if (producerIds) {
        query = query.in('biochar_producer_id', producerIds);
      }

      return query;
    });

    return rows.map((row) => {
      const producerRaw = row.biochar_producer;
      const producer = Array.isArray(producerRaw)
        ? (producerRaw[0] as MobileNetworkProducer | undefined) ?? null
        : (producerRaw as MobileNetworkProducer | null);

      return {
        id: row.id as string,
        biomass_type: row.biomass_type as string,
        lab_status: row.lab_status as string,
        biochar_producer_id: row.biochar_producer_id as string,
        producer,
      };
    });
  }
}
