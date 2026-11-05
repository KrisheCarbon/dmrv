import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessWebPortal } from '@krishecarbon/shared';
import type { AuthenticatedUser } from '../auth/auth.types';

/** Admin, manager, supervisor, and dMRV viewer already receive every farmer. */
export function seesEveryFarm(role: string): boolean {
  return canAccessWebPortal(role);
}

/**
 * Clusters a supervisor or climapreneur is assigned to.
 * Several people share one cluster, so a farmer saved by any of them
 * belongs to the whole cluster.
 */
export async function assignedFieldClusterIds(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
): Promise<string[]> {
  const isSupervisor = user.role === 'supervisor';
  const isClimapreneur = user.role === 'climapreneur';
  if (!isSupervisor && !isClimapreneur) return [];

  const table = isSupervisor ? 'cluster_supervisors' : 'cluster_climapreneurs';
  const column = isSupervisor ? 'supervisor_id' : 'climapreneur_id';
  const { data, error } = await supabase
    .from(table)
    .select('cluster_id')
    .eq(column, user.id);

  if (error) throw new BadRequestException(error.message);
  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.cluster_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/**
 * PostgREST `or` filter: farmers this person saved, plus every farmer
 * in the clusters they are assigned to.
 */
/**
 * People who share a cluster with this user: the user, every supervisor
 * assigned to those clusters, and every climapreneur assigned to them.
 * Null means this role already sees the whole company.
 */
export async function clusterPeerIds(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
): Promise<string[] | null> {
  if (
    user.role === 'admin' ||
    user.role === 'manager' ||
    user.role === 'dmrv_viewer'
  ) {
    return null;
  }

  const clusterIds = await assignedFieldClusterIds(supabase, user);
  if (clusterIds.length === 0) return [user.id];

  const [supervisors, climapreneurs] = await Promise.all([
    supabase
      .from('cluster_supervisors')
      .select('supervisor_id')
      .in('cluster_id', clusterIds),
    supabase
      .from('cluster_climapreneurs')
      .select('climapreneur_id')
      .in('cluster_id', clusterIds),
  ]);
  if (supervisors.error) throw new BadRequestException(supervisors.error.message);
  if (climapreneurs.error) {
    throw new BadRequestException(climapreneurs.error.message);
  }

  const ids = new Set<string>([user.id]);
  for (const row of supervisors.data ?? []) {
    if (row.supervisor_id) ids.add(row.supervisor_id as string);
  }
  for (const row of climapreneurs.data ?? []) {
    if (row.climapreneur_id) ids.add(row.climapreneur_id as string);
  }
  return [...ids];
}

/** Supervisors can read kiln, mixing, and application records. They do not create them. */
export function assertSupervisorCannotEnter(
  user: AuthenticatedUser,
  what: string,
): void {
  if (user.role !== 'supervisor') return;
  throw new ForbiddenException(
    `Supervisors can view ${what} entered in their clusters. They do not enter ${what}.`,
  );
}

export function farmVisibilityFilter(userId: string, clusterIds: string[]): string {
  const parts = [`created_by.eq.${userId}`, `assigned_to.eq.${userId}`];
  if (clusterIds.length > 0) {
    parts.push(`cluster_id.in.(${clusterIds.join(',')})`);
  }
  return parts.join(',');
}
