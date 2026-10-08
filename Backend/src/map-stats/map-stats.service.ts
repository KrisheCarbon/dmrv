import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessWebPortal, isDmrvViewer } from '@krishecarbon/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type {
  FarmerMapClusterStats,
  FarmerMapMetricSet,
  FarmerMapPersonStats,
  FarmerMapStats,
  FarmerMapSupervisorStats,
} from './map-stats.types';

interface UserRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string | null;
}

interface ClusterRow {
  id: string;
  name: string | null;
}

interface LinkRow {
  cluster_id: string;
  supervisor_id?: string;
  climapreneur_id?: string;
}

interface FarmRow {
  id: string;
  cluster_id: string | null;
  total_land_size: number | null;
  owned_land_size: number | null;
  leased_land_size: number | null;
  estimated_biomass: number | null;
  created_by: string | null;
  assigned_to: string | null;
}

interface FieldRow {
  id: string;
  farm_id: string;
  status: string | null;
  calculated_area: number | null;
}

interface SoilRow {
  id: string;
  farm_id: string;
}

interface SessionRow {
  id: string;
  operator_id: string | null;
}

interface BatchRow {
  id: string;
  session_id: string;
  kontikki_id: string;
  feedstock_quantity: number | null;
  yield_percent: number | null;
  submission_status: string | null;
}

interface MixingRow {
  id: string;
  farm_id: string | null;
  operator_id: string | null;
  status: string | null;
}

interface MixingLinkRow {
  mixing_entry_id: string;
  pyrolysis_batch_id: string;
}

interface FarmRollup {
  farmersOnboarded: number;
  farmerLeads: number;
  declaredAcres: number;
  mappedAcres: number;
  farmPolygons: number;
  soilTests: number;
  biomassTons: number;
}

const UNASSIGNED_CLUSTER = '__unassigned__';

function emptyMetrics(): FarmerMapMetricSet {
  return {
    climapreneurs: 0,
    climapreneurLeads: 0,
    farmersOnboarded: 0,
    farmerLeads: 0,
    declaredAcres: 0,
    mappedAcres: 0,
    farmPolygons: 0,
    soilTests: 0,
    biomassTons: 0,
    biocharProducedTons: 0,
    biocharMixedTons: 0,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function personName(row: UserRow): string {
  const full = row.full_name?.trim();
  if (full) return full;
  const joined = [row.first_name, row.last_name]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  return joined || 'Unnamed';
}

function dryTonnes(feedstockKg: unknown, yieldPercent: unknown): number {
  const kg = positive(feedstockKg);
  const yieldValue = positive(yieldPercent);
  if (kg <= 0 || yieldValue <= 0) return 0;
  return (kg * (yieldValue / 100)) / 1000;
}

function declaredAcres(farm: FarmRow): number {
  const total = positive(farm.total_land_size);
  if (total > 0) return total;
  return positive(farm.owned_land_size) + positive(farm.leased_land_size);
}

function ownerId(farm: FarmRow): string | null {
  return farm.assigned_to || farm.created_by || null;
}

function finalize(metrics: FarmerMapMetricSet): FarmerMapMetricSet {
  return {
    ...metrics,
    declaredAcres: round2(metrics.declaredAcres),
    mappedAcres: round2(metrics.mappedAcres),
    biomassTons: round2(metrics.biomassTons),
    biocharProducedTons: round2(metrics.biocharProducedTons),
    biocharMixedTons: round2(metrics.biocharMixedTons),
  };
}

@Injectable()
export class MapStatsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async farmerStats(user: AuthenticatedUser): Promise<FarmerMapStats> {
    if (!canAccessWebPortal(user.role) || isDmrvViewer(user.role)) {
      throw new ForbiddenException('Not allowed to view map stats');
    }

    const [
      users,
      clusters,
      supervisorLinks,
      climapreneurLinks,
      farms,
      fields,
      soilTests,
      csiSessions,
      rainbowSessions,
      csiBatches,
      rainbowBatches,
      csiMixingEntries,
      rainbowMixingEntries,
      csiMixingLinks,
      rainbowMixingLinks,
    ] = await Promise.all([
      fetchAllPages<UserRow>((from, to) =>
        this.supabase
          .from('users')
          .select('id, full_name, first_name, last_name, role, status')
          .in('role', ['supervisor', 'climapreneur'])
          .range(from, to),
      ),
      fetchAllPages<ClusterRow>((from, to) =>
        this.supabase
          .from('clusters')
          .select('id, name')
          .order('name', { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<LinkRow>((from, to) =>
        this.supabase
          .from('cluster_supervisors')
          .select('cluster_id, supervisor_id')
          .range(from, to),
      ),
      fetchAllPages<LinkRow>((from, to) =>
        this.supabase
          .from('cluster_climapreneurs')
          .select('cluster_id, climapreneur_id')
          .range(from, to),
      ),
      fetchAllPages<FarmRow>((from, to) =>
        this.supabase
          .from('farms')
          .select(
            'id, cluster_id, total_land_size, owned_land_size, leased_land_size, estimated_biomass, created_by, assigned_to',
          )
          .range(from, to),
      ),
      fetchAllPages<FieldRow>((from, to) =>
        this.supabase
          .from('farm_fields')
          .select('id, farm_id, status, calculated_area')
          .range(from, to),
      ),
      fetchAllPages<SoilRow>((from, to) =>
        this.supabase.from('soil_tests').select('id, farm_id').range(from, to),
      ),
      fetchAllPages<SessionRow>((from, to) =>
        this.supabase
          .from('csi_pyrolysis_sessions')
          .select('id, operator_id')
          .range(from, to),
      ),
      fetchAllPages<SessionRow>((from, to) =>
        this.supabase
          .from('rainbow_pyrolysis_sessions')
          .select('id, operator_id')
          .range(from, to),
      ),
      fetchAllPages<BatchRow>((from, to) =>
        this.supabase
          .from('csi_pyrolysis_batches')
          .select(
            'id, session_id, kontikki_id, feedstock_quantity, yield_percent, submission_status',
          )
          .range(from, to),
      ),
      fetchAllPages<BatchRow>((from, to) =>
        this.supabase
          .from('rainbow_pyrolysis_batches')
          .select(
            'id, session_id, kontikki_id, feedstock_quantity, yield_percent, submission_status',
          )
          .range(from, to),
      ),
      fetchAllPages<MixingRow>((from, to) =>
        this.supabase
          .from('csi_mixing_entries')
          .select('id, farm_id, operator_id, status')
          .range(from, to),
      ),
      fetchAllPages<MixingRow>((from, to) =>
        this.supabase
          .from('rainbow_mixing_entries')
          .select('id, farm_id, operator_id, status')
          .range(from, to),
      ),
      fetchAllPages<MixingLinkRow>((from, to) =>
        this.supabase
          .from('csi_mixing_pyrolysis_links')
          .select('mixing_entry_id, pyrolysis_batch_id')
          .range(from, to),
      ),
      fetchAllPages<MixingLinkRow>((from, to) =>
        this.supabase
          .from('rainbow_mixing_pyrolysis_links')
          .select('mixing_entry_id, pyrolysis_batch_id')
          .range(from, to),
      ),
    ]);

    const sessionsById = new Map<string, SessionRow>();
    for (const row of [...csiSessions, ...rainbowSessions]) {
      sessionsById.set(row.id, row);
    }

    return this.assemble({
      users,
      clusters,
      supervisorLinks,
      climapreneurLinks,
      farms,
      fields,
      soilTests,
      sessions: [...sessionsById.values()],
      csiBatches,
      rainbowBatches,
      mixingEntries: [...csiMixingEntries, ...rainbowMixingEntries],
      mixingLinks: [...csiMixingLinks, ...rainbowMixingLinks],
    });
  }

  private assemble(input: {
    users: UserRow[];
    clusters: ClusterRow[];
    supervisorLinks: LinkRow[];
    climapreneurLinks: LinkRow[];
    farms: FarmRow[];
    fields: FieldRow[];
    soilTests: SoilRow[];
    sessions: SessionRow[];
    csiBatches: BatchRow[];
    rainbowBatches: BatchRow[];
    mixingEntries: MixingRow[];
    mixingLinks: MixingLinkRow[];
  }): FarmerMapStats {
    const people = input.users.filter((row) => row.status !== 'disabled');
    const byId = new Map(people.map((row) => [row.id, row]));
    const clusterName = new Map(
      input.clusters.map((row) => [
        row.id,
        row.name?.trim() || 'Unnamed cluster',
      ]),
    );

    const clustersByPerson = new Map<string, Set<string>>();
    const supervisorsByCluster = new Map<string, Set<string>>();
    const climapreneursByCluster = new Map<string, Set<string>>();

    const remember = (
      personId: string | undefined,
      clusterId: string,
      bucket: Map<string, Set<string>>,
    ) => {
      if (!personId || !byId.has(personId) || !clusterName.has(clusterId)) {
        return;
      }
      const clusters = clustersByPerson.get(personId) ?? new Set<string>();
      clusters.add(clusterId);
      clustersByPerson.set(personId, clusters);
      const peopleInCluster = bucket.get(clusterId) ?? new Set<string>();
      peopleInCluster.add(personId);
      bucket.set(clusterId, peopleInCluster);
    };

    for (const link of input.supervisorLinks) {
      remember(link.supervisor_id, link.cluster_id, supervisorsByCluster);
    }
    for (const link of input.climapreneurLinks) {
      remember(link.climapreneur_id, link.cluster_id, climapreneursByCluster);
    }

    const polygonsByFarm = new Map<string, { count: number; acres: number }>();
    for (const field of input.fields) {
      if (field.status === 'inactive') continue;
      const acres = positive(field.calculated_area);
      if (acres <= 0) continue;
      const current = polygonsByFarm.get(field.farm_id) ?? { count: 0, acres: 0 };
      current.count += 1;
      current.acres += acres;
      polygonsByFarm.set(field.farm_id, current);
    }

    const soilByFarm = new Map<string, number>();
    for (const test of input.soilTests) {
      soilByFarm.set(test.farm_id, (soilByFarm.get(test.farm_id) ?? 0) + 1);
    }

    const farmsByOwner = new Map<string, FarmRow[]>();
    const farmsByCluster = new Map<string, FarmRow[]>();
    for (const farm of input.farms) {
      const owner = ownerId(farm);
      if (owner) {
        const list = farmsByOwner.get(owner) ?? [];
        list.push(farm);
        farmsByOwner.set(owner, list);
      }
      const clusterId = farm.cluster_id && clusterName.has(farm.cluster_id)
        ? farm.cluster_id
        : UNASSIGNED_CLUSTER;
      const list = farmsByCluster.get(clusterId) ?? [];
      list.push(farm);
      farmsByCluster.set(clusterId, list);
    }

    const operatorBySession = new Map(
      input.sessions.map((row) => [row.id, row.operator_id]),
    );
    const csiPairs = new Set<string>();
    const produced: Array<{ operatorId: string | null; tonnes: number }> = [];

    for (const batch of input.csiBatches) {
      if (batch.submission_status !== 'submitted') continue;
      const tonnes = dryTonnes(batch.feedstock_quantity, batch.yield_percent);
      if (tonnes <= 0) continue;
      csiPairs.add(`${batch.session_id}:${batch.kontikki_id}`);
      produced.push({
        operatorId: operatorBySession.get(batch.session_id) ?? null,
        tonnes,
      });
    }
    for (const batch of input.rainbowBatches) {
      if (batch.submission_status !== 'submitted') continue;
      const key = `${batch.session_id}:${batch.kontikki_id}`;
      if (csiPairs.has(key)) continue;
      const tonnes = dryTonnes(batch.feedstock_quantity, batch.yield_percent);
      if (tonnes <= 0) continue;
      produced.push({
        operatorId: operatorBySession.get(batch.session_id) ?? null,
        tonnes,
      });
    }

    const csiTonnes = new Map<string, number>();
    for (const batch of input.csiBatches) {
      if (batch.submission_status !== 'submitted') continue;
      csiTonnes.set(
        batch.id,
        dryTonnes(batch.feedstock_quantity, batch.yield_percent),
      );
    }

    const clusterByFarm = new Map(
      input.farms.map((farm) => [farm.id, farm.cluster_id]),
    );
    const mixingById = new Map(input.mixingEntries.map((row) => [row.id, row]));
    const mixedSeen = new Set<string>();
    const mixed: Array<{
      operatorId: string | null;
      clusterId: string;
      tonnes: number;
    }> = [];
    for (const link of input.mixingLinks) {
      if (mixedSeen.has(link.pyrolysis_batch_id)) continue;
      const tonnes = csiTonnes.get(link.pyrolysis_batch_id) ?? 0;
      if (tonnes <= 0) continue;
      const entry = mixingById.get(link.mixing_entry_id);
      if (!entry || entry.status === 'draft') continue;
      mixedSeen.add(link.pyrolysis_batch_id);
      const farmCluster = entry.farm_id
        ? clusterByFarm.get(entry.farm_id)
        : null;
      mixed.push({
        operatorId: entry.operator_id,
        clusterId:
          farmCluster && clusterName.has(farmCluster)
            ? farmCluster
            : UNASSIGNED_CLUSTER,
        tonnes,
      });
    }

    const rollupFarms = (rows: FarmRow[]): FarmRollup => {
      const rollup: FarmRollup = {
        farmersOnboarded: 0,
        farmerLeads: 0,
        declaredAcres: 0,
        mappedAcres: 0,
        farmPolygons: 0,
        soilTests: 0,
        biomassTons: 0,
      };
      for (const farm of rows) {
        const polygons = polygonsByFarm.get(farm.id);
        if (polygons && polygons.count > 0) rollup.farmersOnboarded += 1;
        else rollup.farmerLeads += 1;
        rollup.declaredAcres += declaredAcres(farm);
        rollup.mappedAcres += polygons?.acres ?? 0;
        rollup.farmPolygons += polygons?.count ?? 0;
        rollup.soilTests += soilByFarm.get(farm.id) ?? 0;
        rollup.biomassTons += positive(farm.estimated_biomass);
      }
      return rollup;
    };

    const biocharFor = (operatorIds: Set<string> | null) => {
      let producedTons = 0;
      let mixedTons = 0;
      for (const row of produced) {
        if (operatorIds && (!row.operatorId || !operatorIds.has(row.operatorId))) {
          continue;
        }
        producedTons += row.tonnes;
      }
      for (const row of mixed) {
        if (operatorIds && (!row.operatorId || !operatorIds.has(row.operatorId))) {
          continue;
        }
        mixedTons += row.tonnes;
      }
      return { producedTons, mixedTons };
    };

    const staffCounts = (ids: Iterable<string>) => {
      let climapreneurs = 0;
      let climapreneurLeads = 0;
      for (const id of ids) {
        const person = byId.get(id);
        if (!person || person.role !== 'climapreneur') continue;
        if (person.status === 'pending_auth') climapreneurLeads += 1;
        else climapreneurs += 1;
      }
      return { climapreneurs, climapreneurLeads };
    };

    const metricsFor = (
      farmRows: FarmRow[],
      climapreneurIds: Iterable<string>,
      operatorIds: Set<string> | null,
      mixedClusterId?: string,
    ): FarmerMapMetricSet => {
      const farmsRollup = rollupFarms(farmRows);
      const staff = staffCounts(climapreneurIds);
      const biochar = mixedClusterId
        ? {
            producedTons: 0,
            mixedTons: mixed
              .filter((row) => row.clusterId === mixedClusterId)
              .reduce((sum, row) => sum + row.tonnes, 0),
          }
        : biocharFor(operatorIds);
      return finalize({
        ...staff,
        ...farmsRollup,
        biocharProducedTons: biochar.producedTons,
        biocharMixedTons: biochar.mixedTons,
      });
    };

    const clusterIds = new Set<string>([
      ...clusterName.keys(),
      ...farmsByCluster.keys(),
      ...mixed.map((row) => row.clusterId),
    ]);

    const clusters: FarmerMapClusterStats[] = [...clusterIds]
      .filter((id) => {
        if (id !== UNASSIGNED_CLUSTER) return true;
        const rows = farmsByCluster.get(id) ?? [];
        return rows.length > 0 || mixed.some((row) => row.clusterId === id);
      })
      .map((id) => {
        const climapreneurIds = climapreneursByCluster.get(id) ?? new Set();
        const supervisorIds = supervisorsByCluster.get(id) ?? new Set();
        const operatorIds = new Set<string>([...supervisorIds, ...climapreneurIds]);
        const farmRows = farmsByCluster.get(id) ?? [];
        const base = metricsFor(farmRows, climapreneurIds, operatorIds, id);
        const producedTons = [...produced]
          .filter((row) => row.operatorId && operatorIds.has(row.operatorId))
          .reduce((sum, row) => sum + row.tonnes, 0);
        return {
          id,
          name: id === UNASSIGNED_CLUSTER ? 'Unassigned' : clusterName.get(id) || 'Unnamed cluster',
          ...base,
          biocharProducedTons: round2(producedTons),
        };
      })
      .sort((a, b) => {
        if (a.id === UNASSIGNED_CLUSTER) return 1;
        if (b.id === UNASSIGNED_CLUSTER) return -1;
        return a.name.localeCompare(b.name);
      });

    const clusterLabels = (personId: string) =>
      [...(clustersByPerson.get(personId) ?? [])]
        .map((id) => clusterName.get(id) || 'Unnamed cluster')
        .sort((a, b) => a.localeCompare(b));

    const climapreneurs: FarmerMapPersonStats[] = people
      .filter((row) => row.role === 'climapreneur')
      .map((row) => ({
        id: row.id,
        name: personName(row),
        status: row.status || 'active',
        clusters: clusterLabels(row.id),
        ...metricsFor(
          farmsByOwner.get(row.id) ?? [],
          [],
          new Set([row.id]),
        ),
      }))
      .sort(
        (a, b) =>
          b.farmersOnboarded - a.farmersOnboarded ||
          b.farmerLeads - a.farmerLeads ||
          a.name.localeCompare(b.name),
      );

    const supervisors: FarmerMapSupervisorStats[] = people
      .filter((row) => row.role === 'supervisor')
      .map((row) => {
        const clusterIdsForSupervisor = clustersByPerson.get(row.id) ?? new Set();
        const team = new Set<string>();
        for (const clusterId of clusterIdsForSupervisor) {
          for (const climapreneurId of climapreneursByCluster.get(clusterId) ?? []) {
            team.add(climapreneurId);
          }
        }
        const teamOperators = new Set<string>([row.id, ...team]);
        const teamFarms: FarmRow[] = [];
        const seenFarms = new Set<string>();
        for (const operatorId of teamOperators) {
          for (const farm of farmsByOwner.get(operatorId) ?? []) {
            if (seenFarms.has(farm.id)) continue;
            seenFarms.add(farm.id);
            teamFarms.push(farm);
          }
        }
        return {
          id: row.id,
          name: personName(row),
          status: row.status || 'active',
          clusters: clusterLabels(row.id),
          climapreneurNames: [...team]
            .map((id) => byId.get(id))
            .filter((person): person is UserRow => Boolean(person))
            .map(personName)
            .sort((a, b) => a.localeCompare(b)),
          own: metricsFor(farmsByOwner.get(row.id) ?? [], [], new Set([row.id])),
          withClimapreneurs: metricsFor(teamFarms, team, teamOperators),
        };
      })
      .sort(
        (a, b) =>
          b.withClimapreneurs.farmersOnboarded - a.withClimapreneurs.farmersOnboarded ||
          a.name.localeCompare(b.name),
      );

    const activeClimapreneurs = people.filter(
      (row) => row.role === 'climapreneur' && row.status !== 'pending_auth',
    );
    const pendingClimapreneurs = people.filter(
      (row) => row.role === 'climapreneur' && row.status === 'pending_auth',
    );
    const overallFarms = rollupFarms(input.farms);
    const overallBiochar = biocharFor(null);

    const overall = finalize({
      climapreneurs: activeClimapreneurs.length,
      climapreneurLeads: pendingClimapreneurs.length,
      ...overallFarms,
      biocharProducedTons: overallBiochar.producedTons,
      biocharMixedTons: overallBiochar.mixedTons,
    });

    return { overall, clusters, climapreneurs, supervisors };
  }
}
