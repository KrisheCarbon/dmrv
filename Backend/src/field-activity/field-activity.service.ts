import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  FieldActivityCluster,
  FieldActivityCounts,
  FieldActivityEntry,
  FieldActivityPerson,
  FieldActivityScope,
  FieldActivityStats,
  FieldActivityTeam,
} from './field-activity.types';

const RECENT_LIMIT = 8;
const LATEST_LIMIT = 30;
const MONITOR_ROLES = new Set(['admin', 'manager', 'supervisor', 'climapreneur']);
const ENTRY_SCOPES = new Set([
  'company',
  'team',
  'me',
  'climapreneurs',
  'supervisors',
]);

interface UserRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string | null;
}

interface LinkRow {
  cluster_id: string;
  supervisor_id?: string;
  climapreneur_id?: string;
}

interface NamedFarm {
  farmer_name?: string | null;
  village?: string | null;
  cluster_id?: string | null;
}

interface FarmRow {
  id: string;
  farmer_name: string | null;
  village: string | null;
  cluster_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface ClusterRow {
  id: string;
  name: string | null;
}

interface FieldRow {
  id: string;
  field_code: string | null;
  status: string | null;
  created_by: string | null;
  created_at: string;
  farm: NamedFarm | NamedFarm[] | null;
}

interface LinkedRow {
  id: string;
  created_by: string | null;
  created_at: string;
  farm: NamedFarm | NamedFarm[] | null;
}

type EntryKind = FieldActivityEntry['kind'];

interface ActivityEvent {
  kind: EntryKind;
  id: string;
  actorId: string | null;
  farmerName: string;
  detail: string | null;
  enteredAt: string;
  clusterId: string | null;
  /** Set on farmer events: the farmer has at least one active farm plot. */
  hasFarm?: boolean;
}

function emptyCounts(): FieldActivityCounts {
  return {
    farmers: 0,
    farmersInfoOnly: 0,
    farmersWithFarm: 0,
    farms: 0,
    consents: 0,
    soilTests: 0,
    soilReports: 0,
  };
}

function addCount(counts: FieldActivityCounts, event: ActivityEvent) {
  if (event.kind === 'farmer') {
    counts.farmers += 1;
    if (event.hasFarm) counts.farmersWithFarm += 1;
    else counts.farmersInfoOnly += 1;
  } else if (event.kind === 'farm') counts.farms += 1;
  else if (event.kind === 'consent') counts.consents += 1;
  else if (event.kind === 'soil') counts.soilTests += 1;
  else if (event.kind === 'soilReport') counts.soilReports += 1;
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

function asFarm(value: NamedFarm | NamedFarm[] | null | undefined): NamedFarm | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function farmerLabel(farm: NamedFarm | null): string {
  return farm?.farmer_name?.trim() || 'Unknown farmer';
}

function villageLabel(farm: NamedFarm | null): string | null {
  return farm?.village?.trim() || null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function byActivity(a: FieldActivityPerson, b: FieldActivityPerson): number {
  const score = (person: FieldActivityPerson) =>
    person.counts.farmers +
    person.counts.farms +
    person.counts.consents +
    person.counts.soilTests +
    person.counts.soilReports;
  return score(b) - score(a) || a.name.localeCompare(b.name);
}

@Injectable()
export class FieldActivityService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async getStats(
    user: AuthenticatedUser,
    range: {
      from?: string;
      to?: string;
      clusterId?: string;
      scope?: string;
      userId?: string;
    },
  ): Promise<FieldActivityStats> {
    if (!MONITOR_ROLES.has(user.role)) {
      throw new ForbiddenException('Not allowed to view field activity');
    }

    const from = this.calendarDate(range.from, 'From');
    const to = this.calendarDate(range.to, 'To');
    if (from && to && from > to) {
      throw new BadRequestException('From date must be on or before the to date');
    }

    const start = from ? `${from}T00:00:00.000+05:30` : null;
    const end = to ? `${to}T23:59:59.999+05:30` : null;

    const [users, supervisorLinks, climapreneurLinks, clusterRows, farms, fields, farmedFarmerIds, consents, soilTests, soilReports] =
      await Promise.all([
        fetchAllPages<UserRow>((pageFrom, pageTo) =>
          this.supabase
            .from('users')
            .select('id, full_name, first_name, last_name, role, status')
            .order('id', { ascending: true })
            .range(pageFrom, pageTo),
        ),
        fetchAllPages<LinkRow>((pageFrom, pageTo) =>
          this.supabase
            .from('cluster_supervisors')
            .select('cluster_id, supervisor_id')
            .order('cluster_id', { ascending: true })
            .range(pageFrom, pageTo),
        ),
        fetchAllPages<LinkRow>((pageFrom, pageTo) =>
          this.supabase
            .from('cluster_climapreneurs')
            .select('cluster_id, climapreneur_id')
            .order('cluster_id', { ascending: true })
            .range(pageFrom, pageTo),
        ),
        fetchAllPages<ClusterRow>((pageFrom, pageTo) =>
          this.supabase
            .from('clusters')
            .select('id, name')
            .order('id', { ascending: true })
            .range(pageFrom, pageTo),
        ),
        fetchAllPages<FarmRow>((pageFrom, pageTo) => {
          let query = this.supabase
            .from('farms')
            .select('id, farmer_name, village, cluster_id, created_by, created_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (start) query = query.gte('created_at', start);
          if (end) query = query.lte('created_at', end);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllPages<FieldRow>((pageFrom, pageTo) => {
          let query = this.supabase
            .from('farm_fields')
            .select(
              'id, field_code, status, created_by, created_at, farm:farms(farmer_name, village, cluster_id)',
            )
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (start) query = query.gte('created_at', start);
          if (end) query = query.lte('created_at', end);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllPages<{ farm_id: string; status: string | null }>((pageFrom, pageTo) =>
          this.supabase
            .from('farm_fields')
            .select('id, farm_id, status')
            .order('id', { ascending: true })
            .range(pageFrom, pageTo),
        ),
        fetchAllPages<LinkedRow>((pageFrom, pageTo) => {
          let query = this.supabase
            .from('farmer_consents')
            .select('id, created_by, created_at, farm:farms(farmer_name, village, cluster_id)')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (start) query = query.gte('created_at', start);
          if (end) query = query.lte('created_at', end);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllPages<LinkedRow>((pageFrom, pageTo) => {
          let query = this.supabase
            .from('soil_tests')
            .select('id, created_by, created_at, farm:farms(farmer_name, village, cluster_id)')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (start) query = query.gte('created_at', start);
          if (end) query = query.lte('created_at', end);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllPages<LinkedRow>((pageFrom, pageTo) => {
          let query = this.supabase
            .from('soil_reports')
            .select('id, created_by, created_at, farm:farms(farmer_name, village, cluster_id)')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (start) query = query.gte('created_at', start);
          if (end) query = query.lte('created_at', end);
          return query.range(pageFrom, pageTo);
        }),
      ]);

    const farmersWithAFarm = new Set(
      farmedFarmerIds
        .filter((row) => row.status !== 'inactive' && row.farm_id)
        .map((row) => row.farm_id),
    );
    const events: ActivityEvent[] = [];

    for (const farm of farms) {
      events.push({
        kind: 'farmer',
        id: farm.id,
        actorId: farm.created_by,
        farmerName: farm.farmer_name?.trim() || 'Unknown farmer',
        detail: farm.village?.trim() || null,
        enteredAt: farm.created_at,
        clusterId: farm.cluster_id,
        hasFarm: farmersWithAFarm.has(farm.id),
      });
    }

    for (const field of fields) {
      if (field.status === 'inactive') continue;
      const farm = asFarm(field.farm);
      events.push({
        kind: 'farm',
        id: field.id,
        actorId: field.created_by,
        farmerName: farmerLabel(farm),
        detail: field.field_code?.trim() || villageLabel(farm),
        enteredAt: field.created_at,
        clusterId: farm?.cluster_id ?? null,
      });
    }

    for (const consent of consents) {
      const farm = asFarm(consent.farm);
      events.push({
        kind: 'consent',
        id: consent.id,
        actorId: consent.created_by,
        farmerName: farmerLabel(farm),
        detail: villageLabel(farm),
        enteredAt: consent.created_at,
        clusterId: farm?.cluster_id ?? null,
      });
    }

    for (const test of soilTests) {
      const farm = asFarm(test.farm);
      events.push({
        kind: 'soil',
        id: test.id,
        actorId: test.created_by,
        farmerName: farmerLabel(farm),
        detail: villageLabel(farm),
        enteredAt: test.created_at,
        clusterId: farm?.cluster_id ?? null,
      });
    }

    for (const report of soilReports) {
      const farm = asFarm(report.farm);
      events.push({
        kind: 'soilReport',
        id: report.id,
        actorId: report.created_by,
        farmerName: farmerLabel(farm),
        detail: villageLabel(farm),
        enteredAt: report.created_at,
        clusterId: farm?.cluster_id ?? null,
      });
    }

    return this.assemble({
      role: user.role,
      userId: user.id,
      from,
      to,
      requestedClusterId: range.clusterId?.trim() || null,
      requestedScope: range.scope?.trim() || null,
      requestedUserId: range.userId?.trim() || null,
      users,
      supervisorLinks,
      climapreneurLinks,
      clusterRows,
      events,
    });
  }

  private calendarDate(value: string | undefined, label: string): string | null {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    if (!isCalendarDate(trimmed)) {
      throw new BadRequestException(`${label} must be a date like 2026-10-06`);
    }
    return trimmed;
  }

  private assemble(input: {
    role: string;
    userId: string;
    from: string | null;
    to: string | null;
    requestedClusterId: string | null;
    requestedScope: string | null;
    requestedUserId: string | null;
    users: UserRow[];
    supervisorLinks: LinkRow[];
    climapreneurLinks: LinkRow[];
    clusterRows: ClusterRow[];
    events: ActivityEvent[];
  }): FieldActivityStats {
    const rosterRoles = new Set([
      'admin',
      'manager',
      'supervisor',
      'climapreneur',
    ]);
    const roster = input.users.filter(
      (row) => row.status !== 'disabled' && rosterRoles.has(row.role),
    );
    const fieldStaff = roster.filter(
      (row) => row.role === 'supervisor' || row.role === 'climapreneur',
    );
    const byId = new Map(fieldStaff.map((row) => [row.id, row]));
    const nameById = new Map(input.users.map((row) => [row.id, personName(row)]));

    const clustersBySupervisor = new Map<string, Set<string>>();
    const climapreneursByCluster = new Map<string, Set<string>>();

    for (const link of input.supervisorLinks) {
      if (!link.supervisor_id || !byId.has(link.supervisor_id)) continue;
      const clusters = clustersBySupervisor.get(link.supervisor_id) ?? new Set();
      clusters.add(link.cluster_id);
      clustersBySupervisor.set(link.supervisor_id, clusters);
    }

    for (const link of input.climapreneurLinks) {
      if (!link.climapreneur_id || !byId.has(link.climapreneur_id)) continue;
      const members = climapreneursByCluster.get(link.cluster_id) ?? new Set();
      members.add(link.climapreneur_id);
      climapreneursByCluster.set(link.cluster_id, members);
    }

    const clustersByClimapreneur = new Map<string, Set<string>>();
    for (const [clusterId, members] of climapreneursByCluster) {
      for (const climapreneurId of members) {
        const clusters = clustersByClimapreneur.get(climapreneurId) ?? new Set();
        clusters.add(clusterId);
        clustersByClimapreneur.set(climapreneurId, clusters);
      }
    }

    const clusterNames = new Map(
      input.clusterRows.map((row) => [row.id, row.name?.trim() || 'Cluster']),
    );
    const isPortal = input.role === 'admin' || input.role === 'manager';
    const isSupervisor = input.role === 'supervisor';
    const isClimapreneur = input.role === 'climapreneur';
    const viewerClusterIds = isSupervisor
      ? (clustersBySupervisor.get(input.userId) ?? new Set<string>())
      : isClimapreneur
        ? (clustersByClimapreneur.get(input.userId) ?? new Set<string>())
        : new Set(clusterNames.keys());

    for (const clusterId of viewerClusterIds) {
      if (!clusterNames.has(clusterId)) clusterNames.set(clusterId, 'Cluster');
    }

    const requestedClusterId = input.requestedClusterId;
    if (requestedClusterId && !isUuid(requestedClusterId)) {
      throw new BadRequestException('Cluster must be a cluster id');
    }
    if (requestedClusterId && !isPortal && !viewerClusterIds.has(requestedClusterId)) {
      throw new ForbiddenException('That cluster is not assigned to you');
    }
    if (requestedClusterId && isPortal && !clusterNames.has(requestedClusterId)) {
      throw new BadRequestException('Unknown cluster');
    }

    let scope: FieldActivityScope;
    if (isClimapreneur) {
      const asked = input.requestedScope;
      if (!asked || asked === 'cluster' || asked === 'team') scope = 'cluster';
      else if (asked === 'company') {
        throw new ForbiddenException('All KriSHE data is only available to admins');
      } else if (
        asked === 'me' ||
        asked === 'supervisors' ||
        asked === 'climapreneurs'
      ) {
        scope = asked;
      } else {
        throw new BadRequestException('Unknown filter');
      }
    } else if (!input.requestedScope) {
      scope = isPortal ? 'company' : 'team';
    } else if (!ENTRY_SCOPES.has(input.requestedScope)) {
      throw new BadRequestException('Unknown filter');
    } else if (input.requestedScope === 'company' && !isPortal) {
      throw new ForbiddenException('All KriSHE data is only available to admins');
    } else {
      scope = input.requestedScope as FieldActivityScope;
    }

    const activeClusters: Set<string> | null = requestedClusterId
      ? new Set([requestedClusterId])
      : isPortal
        ? null
        : viewerClusterIds;

    const clusterEvents = input.events.filter((event) => {
      if (!activeClusters) return true;
      return Boolean(event.clusterId && activeClusters.has(event.clusterId));
    });

    const teamFor = (supervisorId: string): Set<string> => {
      const team = new Set<string>();
      for (const clusterId of clustersBySupervisor.get(supervisorId) ?? []) {
        if (activeClusters && !activeClusters.has(clusterId)) continue;
        for (const climapreneurId of climapreneursByCluster.get(clusterId) ?? []) {
          team.add(climapreneurId);
        }
      }
      return team;
    };

    const sharesActiveCluster = (supervisorId: string): boolean => {
      if (!activeClusters) return true;
      for (const clusterId of clustersBySupervisor.get(supervisorId) ?? []) {
        if (activeClusters.has(clusterId)) return true;
      }
      return false;
    };

    const toEntry = (event: ActivityEvent): FieldActivityEntry => ({
      kind: event.kind,
      id: `${event.kind}:${event.id}`,
      farmerName: event.farmerName,
      detail: event.detail,
      enteredAt: event.enteredAt,
      enteredByName: event.actorId
        ? nameById.get(event.actorId) || 'Unknown'
        : 'Unknown',
    });

    const personStats = (row: UserRow): FieldActivityPerson => {
      const mine = clusterEvents
        .filter((event) => event.actorId === row.id)
        .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
      const counts = emptyCounts();
      for (const event of mine) addCount(counts, event);
      return {
        id: row.id,
        name: personName(row),
        role: row.role,
        counts,
        lastEnteredAt: mine[0]?.enteredAt ?? null,
        recent: mine.slice(0, RECENT_LIMIT).map(toEntry),
      };
    };

    const countsFor = (actorIds: Set<string> | null): FieldActivityCounts => {
      const counts = emptyCounts();
      for (const event of clusterEvents) {
        if (actorIds && (!event.actorId || !actorIds.has(event.actorId))) continue;
        addCount(counts, event);
      }
      return counts;
    };

    const supervisors = fieldStaff
      .filter((row) => row.role === 'supervisor')
      .map((row) => personStats(row));
    const climapreneurs = fieldStaff
      .filter((row) => row.role === 'climapreneur')
      .map((row) => personStats(row));
    const admins = roster
      .filter((row) => row.role === 'admin')
      .map((row) => personStats(row))
      .sort(byActivity);
    const managers = roster
      .filter((row) => row.role === 'manager')
      .map((row) => personStats(row))
      .sort(byActivity);
    const supervisorById = new Map(supervisors.map((row) => [row.id, row]));
    const climapreneurById = new Map(climapreneurs.map((row) => [row.id, row]));

    const visibleClimapreneurIds = new Set<string>();
    const climapreneurClusters = activeClusters ?? new Set(climapreneursByCluster.keys());
    for (const clusterId of climapreneurClusters) {
      for (const climapreneurId of climapreneursByCluster.get(clusterId) ?? []) {
        visibleClimapreneurIds.add(climapreneurId);
      }
    }

    const membersFor = (supervisorId: string): Set<string> => {
      const members = teamFor(supervisorId);
      if (!isSupervisor) return members;
      const shared = new Set<string>();
      for (const id of members) {
        if (visibleClimapreneurIds.has(id)) shared.add(id);
      }
      return shared;
    };

    const teams: FieldActivityTeam[] = supervisors
          .filter((supervisor) => sharesActiveCluster(supervisor.id))
          .map((supervisor) => {
            const memberIds = membersFor(supervisor.id);
            const members = [...memberIds]
              .map((id) => climapreneurById.get(id))
              .filter((person): person is FieldActivityPerson => Boolean(person))
              .sort(byActivity);
            return {
              supervisor: supervisorById.get(supervisor.id)!,
              climapreneurs: members,
              totals: countsFor(new Set([supervisor.id, ...memberIds])),
            };
          })
          .sort(
            (a, b) =>
              b.totals.farmers - a.totals.farmers ||
              b.totals.farms - a.totals.farms ||
              a.supervisor.name.localeCompare(b.supervisor.name),
          );

    const assigned = new Set<string>();
    for (const team of teams) {
      for (const person of team.climapreneurs) assigned.add(person.id);
    }
    const unassignedClimapreneurs = isSupervisor
      ? []
      : climapreneurs
          .filter((person) => {
            if (activeClusters && !visibleClimapreneurIds.has(person.id)) return false;
            return !assigned.has(person.id);
          })
          .sort(byActivity);

    const scopedClimapreneurs = [...visibleClimapreneurIds]
      .map((id) => climapreneurById.get(id))
      .filter((person): person is FieldActivityPerson => Boolean(person))
      .sort(byActivity);

    const supervisorIds = new Set(
      supervisors
        .filter((person) => sharesActiveCluster(person.id))
        .map((person) => person.id),
    );
    const requestedUserId = input.requestedUserId;
    if (requestedUserId && !isUuid(requestedUserId)) {
      throw new BadRequestException('User must be a user id');
    }
    if (
      requestedUserId &&
      requestedUserId !== input.userId &&
      !supervisorIds.has(requestedUserId) &&
      !visibleClimapreneurIds.has(requestedUserId)
    ) {
      throw new ForbiddenException('That person is not on the selected clusters');
    }

    let totalActors: Set<string> | null =
      scope === 'company' || scope === 'cluster'
        ? null
        : scope === 'me'
          ? new Set([input.userId])
          : scope === 'climapreneurs'
            ? visibleClimapreneurIds
            : scope === 'supervisors'
              ? supervisorIds
              : isSupervisor
                ? new Set([input.userId, ...visibleClimapreneurIds])
                : new Set([...supervisorIds, ...visibleClimapreneurIds]);
    if (requestedUserId) totalActors = new Set([requestedUserId]);

    const totals = countsFor(totalActors);
    const latest = clusterEvents
      .filter((event) => !totalActors || (event.actorId && totalActors.has(event.actorId)))
      .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))
      .slice(0, LATEST_LIMIT)
      .map(toEntry);

    const selfRow = input.users.find((row) => row.id === input.userId) ?? null;
    const clusters: FieldActivityCluster[] = [...viewerClusterIds]
      .map((id) => ({ id, name: clusterNames.get(id) || 'Cluster' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      role: input.role,
      from: input.from,
      to: input.to,
      clusters,
      clusterId: requestedClusterId,
      userId: requestedUserId,
      scope,
      totals,
      self: isClimapreneur && selfRow ? personStats(selfRow) : null,
      climapreneurs: scopedClimapreneurs,
      admins: isPortal ? admins : [],
      managers: isPortal ? managers : [],
      teams,
      unassignedClimapreneurs,
      latest,
    };
  }
}
