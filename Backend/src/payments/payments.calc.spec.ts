import { priceCountedWork, priceFarmRegistration, matchRate, buildStatement } from './payments.calc';
import type { FarmerWork, RateCardRecord, WorkLocation } from './payments.types';

const sagar: WorkLocation = { producer_ids: ['sagar'], village_id: 'village-a' };
const other: WorkLocation = { producer_ids: ['other'], village_id: 'village-b' };

function card(partial: Partial<RateCardRecord> & Pick<RateCardRecord, 'id' | 'scope' | 'rates'>): RateCardRecord {
  return {
    name: partial.id,
    effective_from: '2026-01-01',
    effective_to: null,
    notes: null,
    status: 'active',
    producer_ids: [],
    village_ids: [],
    created_at: '2026-01-01',
    ...partial,
  };
}

const allSites = card({
  id: 'all',
  scope: 'all_producers',
  rates: [
    { activity: 'farmer_registration', amount_inr: 10 },
    { activity: 'farm_registration', amount_inr: 15, farm_basis: 'per_farm' },
  ],
});

const sagarSites = card({
  id: 'sagar',
  name: 'Sagar',
  scope: 'producers',
  producer_ids: ['sagar'],
  effective_from: '2026-04-01',
  rates: [
    { activity: 'farmer_registration', amount_inr: 25 },
    { activity: 'farm_registration', amount_inr: 40, farm_basis: 'any_farm' },
  ],
});

const oneVillage = card({
  id: 'village',
  scope: 'villages',
  village_ids: ['village-a'],
  effective_from: '2026-06-01',
  rates: [{ activity: 'farmer_registration', amount_inr: 30 }],
});

describe('matchRate', () => {
  const cards = [allSites, sagarSites, oneVillage];

  it('uses the village card ahead of the producer card and the all-sites card', () => {
    const match = matchRate(cards, 'farmer_registration', sagar, '2026-07-01');
    expect(match?.card.id).toBe('village');
    expect(match?.amount_inr).toBe(30);
  });

  it('uses the producer card when the village card does not price that activity', () => {
    const match = matchRate(cards, 'farm_registration', sagar, '2026-07-01');
    expect(match?.card.id).toBe('sagar');
    expect(match?.farm_basis).toBe('any_farm');
    expect(match?.amount_inr).toBe(40);
  });

  it('falls back to the all-sites card outside a producer window', () => {
    const match = matchRate(cards, 'farmer_registration', sagar, '2026-02-01');
    expect(match?.card.id).toBe('all');
    expect(match?.amount_inr).toBe(10);
  });

  it('does not apply a card before it starts or after it ends', () => {
    const ended = card({
      id: 'ended',
      scope: 'all_producers',
      effective_from: '2026-01-01',
      effective_to: '2026-01-31',
      rates: [{ activity: 'soil_sample', amount_inr: 8 }],
    });
    expect(matchRate([ended], 'soil_sample', other, '2026-02-01')).toBeNull();
    expect(matchRate([ended], 'soil_sample', other, '2026-01-15')?.amount_inr).toBe(8);
  });

  it('prefers the later start date when two cards are equally specific', () => {
    const earlier = card({
      id: 'earlier',
      scope: 'producers',
      producer_ids: ['sagar'],
      effective_from: '2026-01-01',
      rates: [{ activity: 'soil_sample', amount_inr: 5 }],
    });
    const later = card({
      id: 'later',
      scope: 'producers',
      producer_ids: ['sagar'],
      effective_from: '2026-03-01',
      rates: [{ activity: 'soil_sample', amount_inr: 9 }],
    });
    expect(matchRate([earlier, later], 'soil_sample', sagar, '2026-04-01')?.card.id).toBe('later');
  });
});

function farmer(fields: FarmerWork['fields'], area = 2): FarmerWork {
  return {
    id: 'farmer-1',
    payee_id: 'climapreneur-1',
    label: 'Lakshmi',
    registered_on: '2026-04-02',
    location: sagar,
    place: 'Sagar · Village A',
    registered_area: area,
    fields,
  };
}

describe('farm registration', () => {
  it('pays once when any plot is entered', () => {
    const result = priceFarmRegistration(
      [sagarSites],
      farmer([
        { id: 'p1', created_on: '2026-04-10', area: 0.4, label: 'Plot 1' },
        { id: 'p2', created_on: '2026-04-11', area: 0.4, label: 'Plot 2' },
      ]),
      '2026-10-19',
    );
    expect(result.earned).toHaveLength(1);
    expect(result.earned[0].amount_inr).toBe(40);
    expect(result.pending).toBeNull();
  });

  it('pays every plot when the rule is per farm', () => {
    const result = priceFarmRegistration(
      [allSites],
      farmer([
        { id: 'p1', created_on: '2026-02-01', area: 1, label: 'Plot 1' },
        { id: 'p2', created_on: '2026-02-02', area: 1, label: 'Plot 2' },
      ]),
      '2026-10-19',
    );
    expect(result.earned.map((line) => line.amount_inr)).toEqual([15, 15]);
  });

  it('pays the full-area amount only after entered area covers registered land', () => {
    const fullArea = card({
      id: 'area',
      scope: 'producers',
      producer_ids: ['sagar'],
      rates: [{ activity: 'farm_registration', amount_inr: 100, farm_basis: 'full_area' }],
    });
    const short = priceFarmRegistration(
      [fullArea],
      farmer([{ id: 'p1', created_on: '2026-05-01', area: 1, label: 'Plot 1' }], 3),
      '2026-10-19',
    );
    expect(short.earned).toHaveLength(0);
    expect(short.pending?.reason).toMatch(/not covered/i);

    const covered = priceFarmRegistration(
      [fullArea],
      farmer(
        [
          { id: 'p1', created_on: '2026-05-01', area: 1, label: 'Plot 1' },
          { id: 'p2', created_on: '2026-05-02', area: 2, label: 'Plot 2' },
        ],
        3,
      ),
      '2026-10-19',
    );
    expect(covered.earned).toHaveLength(1);
    expect(covered.earned[0].occurred_on).toBe('2026-05-02');
    expect(covered.earned[0].amount_inr).toBe(100);
  });

  it('waits when no plot has been entered', () => {
    const result = priceFarmRegistration([sagarSites], farmer([]), '2026-10-19');
    expect(result.earned).toHaveLength(0);
    expect(result.pending?.reason).toMatch(/No farm plot/);
  });

  it('does not add a second farm rule on top of the first one', () => {
    const laterPerFarm = card({
      id: 'later-per',
      scope: 'producers',
      producer_ids: ['sagar'],
      effective_from: '2026-08-01',
      rates: [{ activity: 'farm_registration', amount_inr: 50, farm_basis: 'per_farm' }],
    });
    const result = priceFarmRegistration(
      [sagarSites, laterPerFarm],
      farmer([
        { id: 'p1', created_on: '2026-04-10', area: 1, label: 'Plot 1' },
        { id: 'p2', created_on: '2026-08-10', area: 1, label: 'Plot 2' },
      ]),
      '2026-10-19',
    );
    expect(result.earned).toHaveLength(1);
    expect(result.earned[0].amount_inr).toBe(40);
  });
});

describe('buildStatement', () => {
  it('subtracts recorded payments from what is owed in the selected dates', () => {
    const farmerLine = priceCountedWork([sagarSites], {
      id: 'farmer-1',
      payee_id: 'climapreneur-1',
      activity: 'farmer_registration',
      label: 'Lakshmi',
      occurred_on: '2026-04-02',
      location: sagar,
      place: 'Sagar',
    });
    expect(farmerLine?.amount_inr).toBe(25);

    const statement = buildStatement({
      earnings: [farmerLine!],
      pending: [],
      disbursements: [
        {
          id: 'pay-1',
          payee_id: 'climapreneur-1',
          amount_inr: 10,
          paid_on: '2026-05-01',
          note: 'May transfer',
          proof_name: 'upi.png',
          proof_bucket: 'payment-proofs',
          proof_path: 'climapreneur-1/pay-1/upi.png',
        },
      ],
      people: [{ id: 'climapreneur-1', name: 'Anita', role: 'climapreneur' }],
      from: '2026-04-01',
      to: '2026-04-30',
      signedUrls: { 'pay-1': 'https://example.test/upi.png' },
    });

    expect(statement.totals.owed).toBe(25);
    expect(statement.totals.paid).toBe(0);
    expect(statement.totals.balance).toBe(25);
    expect(statement.people[0].name).toBe('Anita');
    expect(statement.disbursements).toHaveLength(0);
  });

  it('lists people from entered records even when no rate has priced them', () => {
    const statement = buildStatement({
      earnings: [],
      counts: [
        { payee_id: 'climapreneur-1', activity: 'farmer_registration', occurred_on: '2026-04-02' },
        { payee_id: 'climapreneur-1', activity: 'farm_registration', occurred_on: '2026-04-03' },
        { payee_id: 'supervisor-1', activity: 'farmer_registration', occurred_on: '2026-04-04' },
      ],
      pending: [],
      disbursements: [],
      people: [
        { id: 'climapreneur-1', name: 'Anita', role: 'climapreneur' },
        { id: 'supervisor-1', name: 'Ravi', role: 'supervisor' },
      ],
      from: null,
      to: null,
    });

    expect(statement.totals.owed).toBe(0);
    expect(statement.totals.entry_count).toBe(3);
    expect(statement.people).toHaveLength(2);
    const anita = statement.people.find((person) => person.name === 'Anita');
    expect(anita?.by_activity.find((row) => row.activity === 'farmer_registration')?.count).toBe(1);
    expect(anita?.by_activity.find((row) => row.activity === 'farm_registration')?.count).toBe(1);
    expect(anita?.owed).toBe(0);
    expect(anita?.by_activity.find((row) => row.activity === 'farmer_registration')?.how).toBe(
      'On file, and not priced by a rate card yet',
    );
  });

  it('explains a priced split from the rate that applied', () => {
    const farmerLine = priceCountedWork([sagarSites], {
      id: 'farmer-1',
      payee_id: 'climapreneur-1',
      activity: 'farmer_registration',
      label: 'Lakshmi',
      occurred_on: '2026-04-02',
      location: sagar,
      place: 'Sagar',
    });
    const farms = priceFarmRegistration(
      [sagarSites],
      {
        id: 'farmer-1',
        payee_id: 'climapreneur-1',
        label: 'Lakshmi',
        registered_on: '2026-04-02',
        location: sagar,
        place: 'Sagar',
        registered_area: 2,
        fields: [
          { id: 'p1', created_on: '2026-04-03', area: 1, label: 'Plot 1' },
          { id: 'p2', created_on: '2026-04-04', area: 1, label: 'Plot 2' },
        ],
      },
      '2026-10-19',
    );
    const statement = buildStatement({
      earnings: [farmerLine!, ...farms.earned],
      counts: [
        { payee_id: 'climapreneur-1', activity: 'farmer_registration', occurred_on: '2026-04-02' },
        { payee_id: 'climapreneur-1', activity: 'farm_registration', occurred_on: '2026-04-03' },
        { payee_id: 'climapreneur-1', activity: 'farm_registration', occurred_on: '2026-04-04' },
      ],
      pending: [],
      disbursements: [],
      people: [{ id: 'climapreneur-1', name: 'Anita', role: 'climapreneur' }],
      from: null,
      to: null,
    });
    const person = statement.people[0];
    expect(person.by_activity.find((row) => row.activity === 'farmer_registration')?.how).toBe(
      '₹25 for each farmer registered',
    );
    expect(person.by_activity.find((row) => row.activity === 'farm_registration')?.how).toContain(
      '₹40 once any farm plot is entered',
    );
    expect(person.by_activity.find((row) => row.activity === 'farm_registration')?.how).toContain(
      '2 plots are on file',
    );
    expect(person.recent).toHaveLength(2);
  });
});
