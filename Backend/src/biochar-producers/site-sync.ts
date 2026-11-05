export interface ExistingProducerSite {
  id: string;
  site_name: string | null;
}

export interface IncomingProducerSite {
  id?: string | null;
  site_name: string;
}

export interface SiteSyncPlan<T extends IncomingProducerSite> {
  updates: Array<{ id: string; site: T }>;
  inserts: T[];
  deleteIds: string[];
}

/**
 * Keep existing project-site rows when a producer is saved.
 * Biomass collections point at producer_sites.id, so replacing every row
 * with a delete-and-insert breaks that link.
 *
 * An incoming site with an id updates that row, including a rename.
 * Sites saved by an older portal have no id, so those match the existing
 * row with the same name. Anything left over is a removal.
 */
export function planSiteSync<T extends IncomingProducerSite>(
  existing: ExistingProducerSite[],
  incoming: T[],
): SiteSyncPlan<T> {
  const remaining = existing.map((row) => ({
    id: row.id,
    name: (row.site_name ?? '').trim(),
  }));
  const updates: Array<{ id: string; site: T }> = [];
  const inserts: T[] = [];

  const take = (index: number) => {
    const [row] = remaining.splice(index, 1);
    return row;
  };

  for (const site of incoming) {
    const id = site.id?.trim();
    if (id) {
      const index = remaining.findIndex((row) => row.id === id);
      if (index === -1) {
        inserts.push(site);
        continue;
      }
      updates.push({ id: take(index).id, site });
      continue;
    }

    const name = site.site_name.trim();
    const index = remaining.findIndex((row) => row.name === name);
    if (index === -1) {
      inserts.push(site);
      continue;
    }
    updates.push({ id: take(index).id, site });
  }

  return {
    updates,
    inserts,
    deleteIds: remaining.map((row) => row.id),
  };
}

export function blockedSiteRemovalMessage(names: string[]): string {
  const quoted = names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `"${name}"`);

  if (quoted.length === 0) {
    return 'Cannot remove a project site because biomass collections are recorded against it.';
  }

  const label =
    quoted.length === 1
      ? quoted[0]
      : quoted.slice(0, -1).join(', ') + ` and ${quoted[quoted.length - 1]}`;
  const pronoun = quoted.length === 1 ? 'it' : 'them';
  return `Cannot remove project site${quoted.length === 1 ? '' : 's'} ${label} because biomass collections are recorded against ${pronoun}.`;
}

export function isBiomassSiteReferenceError(message: string): boolean {
  return (
    message.includes('biomass_collections_producer_site_id_fkey') ||
    (message.includes('biomass_collections') &&
      message.includes('producer_site_id'))
  );
}
