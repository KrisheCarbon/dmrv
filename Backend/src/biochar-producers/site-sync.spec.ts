import {
  blockedSiteRemovalMessage,
  planSiteSync,
  type ExistingProducerSite,
} from './site-sync';

const existing: ExistingProducerSite[] = [
  { id: 'site-north', site_name: 'North' },
  { id: 'site-south', site_name: 'South' },
];

describe('planSiteSync', () => {
  it('updates matching sites in place when the portal does not send ids', () => {
    const plan = planSiteSync(existing, [
      { site_name: 'North' },
      { site_name: 'South' },
    ]);

    expect(plan.updates.map((row) => row.id)).toEqual([
      'site-north',
      'site-south',
    ]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('keeps the same row when a site is renamed by id', () => {
    const plan = planSiteSync(existing, [
      { id: 'site-north', site_name: 'North yard' },
      { id: 'site-south', site_name: 'South' },
    ]);

    expect(plan.updates).toEqual([
      { id: 'site-north', site: { id: 'site-north', site_name: 'North yard' } },
      { id: 'site-south', site: { id: 'site-south', site_name: 'South' } },
    ]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('inserts a new site and marks a removed site for deletion', () => {
    const plan = planSiteSync(existing, [
      { id: 'site-north', site_name: 'North' },
      { site_name: 'East' },
    ]);

    expect(plan.updates.map((row) => row.id)).toEqual(['site-north']);
    expect(plan.inserts).toEqual([{ site_name: 'East' }]);
    expect(plan.deleteIds).toEqual(['site-south']);
  });

  it('does not attach an unknown id to a different site with the same name', () => {
    const plan = planSiteSync(existing, [
      { id: 'new-client-id', site_name: 'North' },
    ]);

    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toEqual([{ id: 'new-client-id', site_name: 'North' }]);
    expect(plan.deleteIds).toEqual(['site-north', 'site-south']);
  });

  it('pairs duplicate names in order', () => {
    const plan = planSiteSync(
      [
        { id: 'a', site_name: 'Yard' },
        { id: 'b', site_name: 'Yard' },
      ],
      [{ site_name: 'Yard' }, { site_name: 'Yard' }],
    );

    expect(plan.updates.map((row) => row.id)).toEqual(['a', 'b']);
    expect(plan.deleteIds).toEqual([]);
  });
});

describe('blockedSiteRemovalMessage', () => {
  it('names the sites that still have biomass collections', () => {
    expect(blockedSiteRemovalMessage(['North'])).toBe(
      'Cannot remove project site "North" because biomass collections are recorded against it.',
    );
    expect(blockedSiteRemovalMessage(['North', 'South'])).toBe(
      'Cannot remove project sites "North" and "South" because biomass collections are recorded against them.',
    );
  });
});
