import {
  hasMappedBoundary,
  isPointInPolygon,
  parseBoundaryGeojson,
  type GeoPoint,
} from '@krishecarbon/shared';

export interface SiteBoundaryRow {
  site_name?: string | null;
  boundary_geojson?: string | Record<string, unknown> | null;
}

export interface KilnFixSource {
  latitude: number;
  longitude: number;
  data_points?: Array<{
    latitude?: number | null;
    longitude?: number | null;
  }>;
}

/** A stored polygon, or null when the ring has fewer than three corners. */
export function normalizeSiteBoundary(
  value: unknown,
): Record<string, unknown> | null {
  if (value == null || value === '') return null;

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (!hasMappedBoundary(record)) return null;
  return record;
}

function isRealFix(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  );
}

/** GPS fixes on the kiln run. Samples still searching (0, 0) are left out. */
export function collectKilnFixPoints(batch: KilnFixSource): GeoPoint[] {
  const points: GeoPoint[] = [];
  const push = (latitude: number | null | undefined, longitude: number | null | undefined) => {
    if (latitude == null || longitude == null) return;
    if (!isRealFix(latitude, longitude)) return;
    points.push({ latitude, longitude });
  };

  push(batch.latitude, batch.longitude);
  for (const sample of batch.data_points ?? []) {
    push(sample.latitude, sample.longitude);
  }
  return points;
}

/**
 * A kiln run for a producer with fixed sites must sit inside one of those polygons.
 * Every real GPS fix on the run is checked. A missing fix is not treated as inside.
 */
export function kilnRunFitsProjectSites(
  batch: KilnFixSource,
  sites: SiteBoundaryRow[],
): { ok: true; siteName: string } | { ok: false; message: string } {
  const mapped = sites.filter((site) => hasMappedBoundary(site.boundary_geojson));
  if (mapped.length === 0) {
    return {
      ok: false,
      message:
        'Draw the project site boundary before uploading a kiln run. Open the producer and trace the site polygon.',
    };
  }

  const fixes = collectKilnFixPoints(batch);
  if (fixes.length === 0) {
    return {
      ok: false,
      message:
        'This kiln run has no GPS fix, so it cannot be checked against the project site boundary.',
    };
  }

  let matchedName = '';
  for (const fix of fixes) {
    const site = mapped.find((row) =>
      isPointInPolygon(fix, parseBoundaryGeojson(row.boundary_geojson)),
    );
    if (!site) {
      return {
        ok: false,
        message:
          'This kiln run is outside the project site boundary. The kiln must run inside a site polygon drawn for this producer.',
      };
    }
    if (!matchedName) matchedName = site.site_name?.trim() || 'project site';
  }

  return { ok: true, siteName: matchedName };
}
