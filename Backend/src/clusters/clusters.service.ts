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
  type ClusterVillageInput,
  type ClusterVillageRecord,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface ClusterPerson {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  role: string;
}

export interface ClusterVillage {
  id: string;
  village_name: string;
  mandal?: string | null;
  district?: string | null;
  state?: string | null;
}

export interface ClusterRecord {
  id: string;
  name: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  villages: ClusterVillage[];
  supervisors: ClusterPerson[];
  climapreneurs: ClusterPerson[];
}

export interface ClusterFormOptions {
  supervisors: ClusterPerson[];
  climapreneurs: ClusterPerson[];
}

export interface ClusterUpsertPayload {
  name: string;
  villages: ClusterVillageInput[];
  supervisor_ids: string[];
  climapreneur_ids: string[];
}

interface ParsedVillage {
  id?: string;
  village_name: string;
  mandal: string;
  district: string;
  state: string;
}

const CLUSTER_SELECT = 'id, name, created_by, created_at, updated_at';
const PERSON_SELECT = 'id, full_name, phone, email, role, status';
const VILLAGE_SELECT =
  'id, cluster_id, village_name, mandal, district, state';

@Injectable()
export class ClustersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Not allowed to manage clusters');
    }
  }

  async formOptions(user: AuthenticatedUser): Promise<ClusterFormOptions> {
    this.assertCanManage(user);
    const [supervisors, climapreneurs] = await Promise.all([
      this.fetchPeopleByRole('supervisor'),
      this.fetchPeopleByRole('climapreneur'),
    ]);
    return { supervisors, climapreneurs };
  }

  async listVillageOptions(
    user: AuthenticatedUser,
  ): Promise<ClusterVillageRecord[]> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to view cluster villages');
    }

    const clusterIds = await this.assignedClusterIds(user);
    if (clusterIds && clusterIds.length === 0) return [];

    let query = this.supabase
      .from('cluster_villages')
      .select(
        `${VILLAGE_SELECT}, cluster:clusters ( id, name )`,
      )
      .order('village_name', { ascending: true });

    if (clusterIds) {
      query = query.in('cluster_id', clusterIds);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.toVillageOption(row));
  }

  async findAll(user: AuthenticatedUser): Promise<ClusterRecord[]> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('clusters')
      .select(CLUSTER_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    const clusters = (data ?? []) as Array<{
      id: string;
      name: string;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    }>;

    if (clusters.length === 0) return [];

    const ids = clusters.map((cluster) => cluster.id);
    const [villagesByCluster, supervisorsByCluster, climapreneursByCluster] =
      await Promise.all([
        this.fetchVillagesByCluster(ids),
        this.fetchAssignedPeople(ids, 'supervisor'),
        this.fetchAssignedPeople(ids, 'climapreneur'),
      ]);

    return clusters.map((cluster) => ({
      ...cluster,
      villages: villagesByCluster.get(cluster.id) ?? [],
      supervisors: supervisorsByCluster.get(cluster.id) ?? [],
      climapreneurs: climapreneursByCluster.get(cluster.id) ?? [],
    }));
  }

  async findById(user: AuthenticatedUser, id: string): Promise<ClusterRecord> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('clusters')
      .select(CLUSTER_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Cluster not found');

    const [villagesByCluster, supervisorsByCluster, climapreneursByCluster] =
      await Promise.all([
        this.fetchVillagesByCluster([id]),
        this.fetchAssignedPeople([id], 'supervisor'),
        this.fetchAssignedPeople([id], 'climapreneur'),
      ]);

    return {
      ...(data as ClusterRecord),
      villages: villagesByCluster.get(id) ?? [],
      supervisors: supervisorsByCluster.get(id) ?? [],
      climapreneurs: climapreneursByCluster.get(id) ?? [],
    };
  }

  async create(
    user: AuthenticatedUser,
    payload: ClusterUpsertPayload,
  ): Promise<ClusterRecord> {
    this.assertCanManage(user);
    const parsed = await this.parsePayload(payload);

    const { data, error } = await this.supabase
      .from('clusters')
      .insert({
        name: parsed.name,
        created_by: user.id,
      })
      .select(CLUSTER_SELECT)
      .single();

    if (error) throw new BadRequestException(error.message);

    try {
      await this.replaceRelations(data.id, parsed);
    } catch (err) {
      await this.supabase.from('clusters').delete().eq('id', data.id);
      throw err;
    }

    return this.findById(user, data.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: ClusterUpsertPayload,
  ): Promise<ClusterRecord> {
    this.assertCanManage(user);
    await this.ensureExists(id);
    const parsed = await this.parsePayload(payload);

    const { error } = await this.supabase
      .from('clusters')
      .update({ name: parsed.name })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);

    await this.replaceRelations(id, parsed);
    return this.findById(user, id);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);
    await this.ensureExists(id);

    const { error } = await this.supabase.from('clusters').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  private async parsePayload(payload: ClusterUpsertPayload): Promise<{
    name: string;
    villages: ParsedVillage[];
    supervisorIds: string[];
    climapreneurIds: string[];
  }> {
    const name = payload.name?.trim() ?? '';
    if (!name) {
      throw new BadRequestException('Cluster name is required.');
    }

    const villages = this.parseVillages(payload.villages ?? []);
    if (villages.length === 0) {
      throw new BadRequestException('Add at least one village.');
    }

    const supervisorIds = this.uniqueIds(payload.supervisor_ids ?? []);
    const climapreneurIds = this.uniqueIds(payload.climapreneur_ids ?? []);

    await this.assertUsersHaveRole(supervisorIds, 'supervisor');
    await this.assertUsersHaveRole(climapreneurIds, 'climapreneur');

    return { name, villages, supervisorIds, climapreneurIds };
  }

  private parseVillages(values: ClusterVillageInput[]): ParsedVillage[] {
    const seen = new Set<string>();
    const villages: ParsedVillage[] = [];

    for (const value of values) {
      const village_name = value.village_name?.trim() ?? '';
      const mandal = value.mandal?.trim() ?? '';
      const district = value.district?.trim() ?? '';
      const state = value.state?.trim() ?? '';
      if (!village_name || !mandal || !district || !state) {
        throw new BadRequestException(
          'Each village needs a name, mandal/block, district, and state.',
        );
      }
      const key = village_name.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(
          `Village "${village_name}" is listed more than once.`,
        );
      }
      seen.add(key);
      villages.push({
        id: value.id?.trim() || undefined,
        village_name,
        mandal,
        district,
        state,
      });
    }

    return villages;
  }

  private async replaceRelations(
    clusterId: string,
    parsed: {
      villages: ParsedVillage[];
      supervisorIds: string[];
      climapreneurIds: string[];
    },
  ): Promise<void> {
    await this.replaceVillages(clusterId, parsed.villages);

    const { error: deleteSupervisorsError } = await this.supabase
      .from('cluster_supervisors')
      .delete()
      .eq('cluster_id', clusterId);
    if (deleteSupervisorsError) {
      throw new BadRequestException(deleteSupervisorsError.message);
    }

    const { error: deleteClimapreneursError } = await this.supabase
      .from('cluster_climapreneurs')
      .delete()
      .eq('cluster_id', clusterId);
    if (deleteClimapreneursError) {
      throw new BadRequestException(deleteClimapreneursError.message);
    }

    if (parsed.supervisorIds.length > 0) {
      const { error } = await this.supabase.from('cluster_supervisors').insert(
        parsed.supervisorIds.map((supervisor_id) => ({
          cluster_id: clusterId,
          supervisor_id,
        })),
      );
      if (error) throw new BadRequestException(error.message);
    }

    if (parsed.climapreneurIds.length > 0) {
      const { error } = await this.supabase.from('cluster_climapreneurs').insert(
        parsed.climapreneurIds.map((climapreneur_id) => ({
          cluster_id: clusterId,
          climapreneur_id,
        })),
      );
      if (error) throw new BadRequestException(error.message);
    }
  }

  private async replaceVillages(
    clusterId: string,
    villages: ParsedVillage[],
  ): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from('cluster_villages')
      .select('id, village_name')
      .eq('cluster_id', clusterId);
    if (existingError) throw new BadRequestException(existingError.message);

    const existingRows = existing ?? [];
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const existingByName = new Map(
      existingRows.map((row) => [row.village_name.trim().toLowerCase(), row]),
    );
    const keepIds = new Set<string>();

    for (const village of villages) {
      const matched =
        (village.id ? existingById.get(village.id) : undefined) ??
        existingByName.get(village.village_name.toLowerCase());

      if (matched) {
        keepIds.add(matched.id);
        const { error } = await this.supabase
          .from('cluster_villages')
          .update({
            village_name: village.village_name,
            mandal: village.mandal,
            district: village.district,
            state: village.state,
          })
          .eq('id', matched.id);
        if (error) throw new BadRequestException(error.message);
        continue;
      }

      const { data: inserted, error } = await this.supabase
        .from('cluster_villages')
        .insert({
          cluster_id: clusterId,
          village_name: village.village_name,
          mandal: village.mandal,
          district: village.district,
          state: village.state,
        })
        .select('id')
        .single();
      if (error) throw new BadRequestException(error.message);
      keepIds.add(inserted.id);
    }

    const toDelete = existingRows
      .map((row) => row.id)
      .filter((id) => !keepIds.has(id));
    if (toDelete.length === 0) return;

    const { error: deleteError } = await this.supabase
      .from('cluster_villages')
      .delete()
      .in('id', toDelete);
    if (deleteError) throw new BadRequestException(deleteError.message);
  }

  private async ensureExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('clusters')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Cluster not found');
  }

  private async assignedClusterIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (canAccessNetwork(user.role)) return null;

    const table =
      user.role === 'supervisor'
        ? 'cluster_supervisors'
        : 'cluster_climapreneurs';
    const column =
      user.role === 'supervisor' ? 'supervisor_id' : 'climapreneur_id';

    if (user.role !== 'supervisor' && user.role !== 'climapreneur') {
      return [];
    }

    const { data, error } = await this.supabase
      .from(table)
      .select('cluster_id')
      .eq(column, user.id);
    if (error) throw new BadRequestException(error.message);
    return [...new Set((data ?? []).map((row) => row.cluster_id as string))];
  }

  private async fetchPeopleByRole(
    role: 'supervisor' | 'climapreneur',
  ): Promise<ClusterPerson[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select(PERSON_SELECT)
      .eq('role', role)
      .neq('status', 'disabled')
      .order('full_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => this.toPerson(row));
  }

  private async fetchVillagesByCluster(
    clusterIds: string[],
  ): Promise<Map<string, ClusterVillage[]>> {
    const map = new Map<string, ClusterVillage[]>();
    if (clusterIds.length === 0) return map;

    const { data, error } = await this.supabase
      .from('cluster_villages')
      .select(VILLAGE_SELECT)
      .in('cluster_id', clusterIds)
      .order('village_name', { ascending: true });

    if (error) throw new BadRequestException(error.message);

    for (const row of data ?? []) {
      const list = map.get(row.cluster_id) ?? [];
      list.push({
        id: row.id,
        village_name: row.village_name,
        mandal: row.mandal ?? null,
        district: row.district ?? null,
        state: row.state ?? null,
      });
      map.set(row.cluster_id, list);
    }

    return map;
  }

  private async fetchAssignedPeople(
    clusterIds: string[],
    role: 'supervisor' | 'climapreneur',
  ): Promise<Map<string, ClusterPerson[]>> {
    const map = new Map<string, ClusterPerson[]>();
    if (clusterIds.length === 0) return map;

    const table =
      role === 'supervisor' ? 'cluster_supervisors' : 'cluster_climapreneurs';
    const userColumn =
      role === 'supervisor' ? 'supervisor_id' : 'climapreneur_id';

    const { data: links, error: linksError } = await this.supabase
      .from(table)
      .select(`cluster_id, ${userColumn}`)
      .in('cluster_id', clusterIds);

    if (linksError) throw new BadRequestException(linksError.message);

    const linkRows = (links ?? []) as Array<
      Record<'cluster_id' | 'supervisor_id' | 'climapreneur_id', string>
    >;

    const userIds = [
      ...new Set(linkRows.map((row) => row[userColumn]).filter(Boolean)),
    ];

    const peopleById = new Map<string, ClusterPerson>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select(PERSON_SELECT)
        .in('id', userIds);

      if (usersError) throw new BadRequestException(usersError.message);
      for (const row of users ?? []) {
        peopleById.set(row.id, this.toPerson(row));
      }
    }

    for (const row of linkRows) {
      const person = peopleById.get(row[userColumn]);
      if (!person) continue;
      const list = map.get(row.cluster_id) ?? [];
      list.push(person);
      map.set(row.cluster_id, list);
    }

    for (const [clusterId, people] of map) {
      people.sort((a, b) => a.full_name.localeCompare(b.full_name));
      map.set(clusterId, people);
    }

    return map;
  }

  private async assertUsersHaveRole(
    ids: string[],
    role: 'supervisor' | 'climapreneur',
  ): Promise<void> {
    if (ids.length === 0) return;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, role')
      .in('id', ids);

    if (error) throw new BadRequestException(error.message);

    const byId = new Map((data ?? []).map((row) => [row.id as string, row.role]));
    const invalid = ids.filter((id) => byId.get(id) !== role);
    if (invalid.length > 0) {
      throw new BadRequestException(
        role === 'supervisor'
          ? 'One or more selected supervisors are not valid supervisor accounts.'
          : 'One or more selected climapreneurs are not valid climapreneur accounts.',
      );
    }
  }

  private toVillageOption(row: Record<string, unknown>): ClusterVillageRecord {
    const clusterRaw = row.cluster as
      | { id?: string; name?: string | null }
      | Array<{ id?: string; name?: string | null }>
      | null
      | undefined;
    const cluster = Array.isArray(clusterRaw) ? clusterRaw[0] : clusterRaw;
    return {
      id: String(row.id),
      cluster_id: String(row.cluster_id),
      cluster_name: cluster?.name?.trim() || 'Unnamed cluster',
      village_name: String(row.village_name ?? ''),
      mandal: (row.mandal as string | null) ?? null,
      district: (row.district as string | null) ?? null,
      state: (row.state as string | null) ?? null,
    };
  }

  private toPerson(row: {
    id: string;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    role?: string | null;
  }): ClusterPerson {
    return {
      id: row.id,
      full_name: row.full_name?.replace(/\s+/g, ' ').trim() || 'Unnamed',
      phone: row.phone ?? null,
      email: row.email ?? null,
      role: row.role ?? '',
    };
  }

  private uniqueIds(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }
}
