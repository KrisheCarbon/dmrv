import { BadRequestException } from '@nestjs/common';
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
export function farmVisibilityFilter(userId: string, clusterIds: string[]): string {
  const parts = [`created_by.eq.${userId}`, `assigned_to.eq.${userId}`];
  if (clusterIds.length > 0) {
    parts.push(`cluster_id.in.(${clusterIds.join(',')})`);
  }
  return parts.join(',');
}
