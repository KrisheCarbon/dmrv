import { kilnRunFitsProjectSites, normalizeSiteBoundary } from './site-boundary';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [78, 17],
      [79, 17],
      [79, 18],
      [78, 18],
      [78, 17],
    ],
  ],
};

const sites = [{ site_name: 'North yard', boundary_geojson: square }];

describe('kilnRunFitsProjectSites', () => {
  it('accepts a kiln fix inside the drawn site', () => {
    const result = kilnRunFitsProjectSites(
      {
        latitude: 17.5,
        longitude: 78.5,
        data_points: [{ latitude: 17.4, longitude: 78.4 }],
      },
      sites,
    );
    expect(result).toEqual({ ok: true, siteName: 'North yard' });
  });

  it('rejects a kiln fix outside every site polygon', () => {
    const result = kilnRunFitsProjectSites(
      { latitude: 17.5, longitude: 78.5, data_points: [{ latitude: 16, longitude: 78 }] },
      sites,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('outside the project site boundary');
    }
  });

  it('rejects a run when the producer has no drawn boundary', () => {
    const result = kilnRunFitsProjectSites(
      { latitude: 17.5, longitude: 78.5 },
      [{ site_name: 'North yard', boundary_geojson: null }],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Draw the project site boundary');
    }
  });

  it('rejects a run whose only coordinates are 0, 0', () => {
    const result = kilnRunFitsProjectSites(
      { latitude: 0, longitude: 0, data_points: [{ latitude: 0, longitude: 0 }] },
      sites,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('no GPS fix');
    }
  });

  it('ignores samples that are still searching for a fix', () => {
    const result = kilnRunFitsProjectSites(
      {
        latitude: 17.5,
        longitude: 78.5,
        data_points: [{ latitude: 0, longitude: 0 }],
      },
      sites,
    );
    expect(result.ok).toBe(true);
  });
});

describe('normalizeSiteBoundary', () => {
  it('keeps a polygon and drops a short ring', () => {
    expect(normalizeSiteBoundary(JSON.stringify(square))?.type).toBe('Polygon');
    expect(normalizeSiteBoundary({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBeNull();
  });
});
