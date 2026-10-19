import {
  ACTIVITY_LABELS,
  FARM_BASES,
  PAYMENT_ACTIVITIES,
  type ActivityTotal,
  type CountedWork,
  type EarningLine,
  type FarmBasis,
  type FarmerWork,
  type PaymentActivity,
  type PaymentStatement,
  type PendingLine,
  type RateCardRecord,
  type StatementDisbursement,
  type StatementPerson,
  type WorkCount,
  type WorkLocation,
} from './payments.types';

export interface MatchResult {
  card: RateCardRecord;
  amount_inr: number;
  farm_basis: FarmBasis | null;
}

export interface PersonRef {
  id: string;
  name: string;
  role: string;
}

export interface DisbursementRow {
  id: string;
  payee_id: string;
  amount_inr: number;
  paid_on: string;
  note: string | null;
  proof_name: string | null;
  proof_bucket: string | null;
  proof_path: string | null;
}

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function inWindow(day: string, from: string | null, to: string | null): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function covers(card: RateCardRecord, day: string): boolean {
  return card.status === 'active' && inWindow(day, card.effective_from, card.effective_to);
}

/** 3 = this village, 2 = this producer site, 1 = every site, 0 = no match. */
function matchRank(card: RateCardRecord, location: WorkLocation): number {
  if (card.scope === 'all_producers') return 1;
  const villageHit = Boolean(location.village_id && card.village_ids.includes(location.village_id));
  const producerHit = card.producer_ids.some((id) => location.producer_ids.includes(id));
  if (card.scope === 'producers') return producerHit ? 2 : 0;
  if (card.scope === 'villages') {
    if (villageHit) return 3;
    if (producerHit) return 2;
    return 0;
  }
  return 0;
}

/** Most specific card in force that day wins. A later start date wins a tie. */
export function matchRate(
  cards: RateCardRecord[],
  activity: PaymentActivity,
  location: WorkLocation,
  day: string,
): MatchResult | null {
  const matches = cards
    .filter((card) => covers(card, day))
    .map((card) => ({
      card,
      rank: matchRank(card, location),
      rate: card.rates.find((rate) => rate.activity === activity) ?? null,
    }))
    .filter((item): item is { card: RateCardRecord; rank: number; rate: NonNullable<(typeof item)['rate']> } =>
      item.rank > 0 && Boolean(item.rate && item.rate.amount_inr > 0),
    )
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return b.card.effective_from.localeCompare(a.card.effective_from);
    });

  const winner = matches[0];
  if (!winner) return null;
  return {
    card: winner.card,
    amount_inr: money(winner.rate.amount_inr),
    farm_basis: winner.rate.farm_basis ?? null,
  };
}

function lineFrom(
  work: { id: string; payee_id: string; label: string; place: string },
  activity: PaymentActivity,
  occurredOn: string,
  sourceId: string,
  match: MatchResult,
): EarningLine {
  return {
    id: `${activity}:${sourceId}`,
    payee_id: work.payee_id,
    activity,
    source_id: sourceId,
    label: work.label,
    occurred_on: occurredOn,
    amount_inr: match.amount_inr,
    place: work.place,
    rate_card_id: match.card.id,
    rate_card_name: match.card.name,
    farm_basis: match.farm_basis,
  };
}

export function priceCountedWork(
  cards: RateCardRecord[],
  work: CountedWork,
): EarningLine | null {
  if (work.activity === 'farm_registration') return null;
  const match = matchRate(cards, work.activity, work.location, work.occurred_on);
  if (!match) return null;
  return lineFrom(work, work.activity, work.occurred_on, work.id, match);
}

/**
 * Farm payment stays on the rule that applied to the farmer's first priced plot.
 * A later card with a different rule does not pay the same farmer again.
 */
export function priceFarmRegistration(
  cards: RateCardRecord[],
  farmer: FarmerWork,
  asOf: string,
): { earned: EarningLine[]; pending: PendingLine | null } {
  const plots = [...farmer.fields].sort((a, b) =>
    a.created_on.localeCompare(b.created_on) || a.id.localeCompare(b.id),
  );

  let basis: FarmBasis | null = null;
  let paidOnce = false;
  let runningArea = 0;
  const earned: EarningLine[] = [];

  for (const plot of plots) {
    runningArea += plot.area > 0 ? plot.area : 0;
    const match = matchRate(cards, 'farm_registration', farmer.location, plot.created_on);
    if (!match?.farm_basis || !FARM_BASES.includes(match.farm_basis)) continue;
    if (!basis) basis = match.farm_basis;
    if (match.farm_basis !== basis || paidOnce) continue;

    if (basis === 'per_farm') {
      earned.push(
        lineFrom(
          { ...farmer, label: `${farmer.label} · ${plot.label}` },
          'farm_registration',
          plot.created_on,
          plot.id,
          match,
        ),
      );
      continue;
    }

    if (basis === 'any_farm') {
      earned.push(lineFrom(farmer, 'farm_registration', plot.created_on, farmer.id, match));
      paidOnce = true;
      continue;
    }

    if (
      basis === 'full_area' &&
      farmer.registered_area > 0 &&
      runningArea >= farmer.registered_area
    ) {
      earned.push(lineFrom(farmer, 'farm_registration', plot.created_on, farmer.id, match));
      paidOnce = true;
    }
  }

  if (earned.length > 0) return { earned, pending: null };

  const open = matchRate(cards, 'farm_registration', farmer.location, asOf);
  if (!open?.farm_basis) return { earned, pending: null };

  if (plots.length === 0) {
    return {
      earned,
      pending: {
        payee_id: farmer.payee_id,
        source_id: farmer.id,
        label: farmer.label,
        reason: 'No farm plot entered yet',
      },
    };
  }

  if (open.farm_basis === 'full_area' || basis === 'full_area') {
    const reason =
      farmer.registered_area <= 0
        ? 'Registered land size is not set, so the full-area payment is waiting'
        : 'Entered farm area has not covered the registered land yet';
    return {
      earned,
      pending: {
        payee_id: farmer.payee_id,
        source_id: farmer.id,
        label: farmer.label,
        reason,
      },
    };
  }

  return { earned, pending: null };
}

function emptyActivityTotals(): ActivityTotal[] {
  return PAYMENT_ACTIVITIES.map((activity) => ({
    activity,
    label: ACTIVITY_LABELS[activity],
    count: 0,
    payments: 0,
    amount_inr: 0,
    how: '',
  }));
}

function rupee(amount: number): string {
  return `₹${Number.isInteger(amount) ? amount.toLocaleString('en-IN') : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function explainActivity(
  activity: PaymentActivity,
  entryCount: number,
  lines: EarningLine[],
): { payments: number; how: string } {
  const payments = lines.length;
  if (payments === 0) {
    return {
      payments: 0,
      how: entryCount > 0 ? 'On file, and not priced by a rate card yet' : '',
    };
  }

  const amounts = [...new Set(lines.map((line) => line.amount_inr))];
  const bases = [
    ...new Set(lines.map((line) => line.farm_basis).filter((basis): basis is FarmBasis => Boolean(basis))),
  ];
  if (amounts.length !== 1 || bases.length > 1) {
    return { payments, how: 'More than one rate applies across these entries' };
  }

  const rate = rupee(amounts[0]);
  if (activity === 'farm_registration') {
    const basis = bases[0];
    if (basis === 'any_farm') {
      const plots =
        entryCount > payments ? ` ${entryCount} plots are on file.` : '';
      return {
        payments,
        how: `${rate} once any farm plot is entered (${payments} ${payments === 1 ? 'payment' : 'payments'}).${plots}`,
      };
    }
    if (basis === 'per_farm') {
      return { payments, how: `${rate} for every farm plot entered` };
    }
    if (basis === 'full_area') {
      return {
        payments,
        how: `${rate} once the entered area covers the farmer's registered land (${payments} ${payments === 1 ? 'payment' : 'payments'}).`,
      };
    }
  }

  if (activity === 'farmer_registration') {
    return { payments, how: `${rate} for each farmer registered` };
  }
  return { payments, how: `${rate} for each ${ACTIVITY_LABELS[activity].toLowerCase()}` };
}

function fillHow(totals: ActivityTotal[], lines: EarningLine[]) {
  for (const row of totals) {
    const explained = explainActivity(
      row.activity,
      row.count,
      lines.filter((line) => line.activity === row.activity),
    );
    row.payments = explained.payments;
    row.how = explained.how;
  }
}

function activityRow(totals: ActivityTotal[], activity: PaymentActivity): ActivityTotal | undefined {
  return totals.find((item) => item.activity === activity);
}

function addActivity(totals: ActivityTotal[], line: EarningLine) {
  const row = activityRow(totals, line.activity);
  if (!row) return;
  row.count += 1;
  row.amount_inr = money(row.amount_inr + line.amount_inr);
}

function addWorkCount(totals: ActivityTotal[], activity: PaymentActivity) {
  const row = activityRow(totals, activity);
  if (!row) return;
  row.count += 1;
}

function addMoney(totals: ActivityTotal[], activity: PaymentActivity, amount: number) {
  const row = activityRow(totals, activity);
  if (!row) return;
  row.amount_inr = money(row.amount_inr + amount);
}

export function buildStatement(args: {
  earnings: EarningLine[];
  pending: PendingLine[];
  disbursements: DisbursementRow[];
  people: PersonRef[];
  from: string | null;
  to: string | null;
  /** Entered records. When set, these are the counts, and earnings only add rupees. */
  counts?: WorkCount[];
  signedUrls?: Record<string, string | null>;
}): Omit<PaymentStatement, 'viewer' | 'totals' | 'rates_active'> & {
  totals: Omit<PaymentStatement['totals'], 'unattributed'>;
} {
  const earnings = args.earnings.filter((line) =>
    inWindow(line.occurred_on, args.from, args.to),
  );
  const counts = (args.counts ?? []).filter((line) =>
    inWindow(line.occurred_on, args.from, args.to),
  );
  const countWork = args.counts != null;
  const paidRows = args.disbursements.filter((row) =>
    inWindow(row.paid_on, args.from, args.to),
  );
  const names = new Map(args.people.map((person) => [person.id, person]));

  const byPerson = new Map<
    string,
    { earned: EarningLine[]; pending: PendingLine[]; paid: number; counts: WorkCount[] }
  >();

  function bucket(id: string) {
    const existing = byPerson.get(id);
    if (existing) return existing;
    const created = {
      earned: [] as EarningLine[],
      pending: [] as PendingLine[],
      paid: 0,
      counts: [] as WorkCount[],
    };
    byPerson.set(id, created);
    return created;
  }

  for (const line of earnings) bucket(line.payee_id).earned.push(line);
  for (const line of counts) bucket(line.payee_id).counts.push(line);
  for (const line of args.pending) bucket(line.payee_id).pending.push(line);
  for (const row of paidRows) bucket(row.payee_id).paid = money(bucket(row.payee_id).paid + row.amount_inr);

  const people: StatementPerson[] = [...byPerson.entries()]
    .map(([id, personBucket]) => {
      const person = names.get(id);
      const byActivity = emptyActivityTotals();
      let owed = 0;
      if (countWork) {
        for (const line of personBucket.counts) addWorkCount(byActivity, line.activity);
        for (const line of personBucket.earned) {
          owed += line.amount_inr;
          addMoney(byActivity, line.activity, line.amount_inr);
        }
      } else {
        for (const line of personBucket.earned) {
          owed += line.amount_inr;
          addActivity(byActivity, line);
        }
      }
      owed = money(owed);
      const paid = money(personBucket.paid);
      const recent = [...personBucket.earned].sort((a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id),
      );
      fillHow(byActivity, personBucket.earned);
      const volume = byActivity.reduce((sum, row) => sum + row.count, 0);
      return {
        id,
        name: person?.name ?? 'Unknown',
        role: person?.role ?? '',
        owed,
        paid,
        balance: money(owed - paid),
        by_activity: byActivity.filter((row) => row.count > 0 || row.amount_inr > 0),
        pending: personBucket.pending,
        recent,
        volume,
      };
    })
    .sort(
      (a, b) =>
        b.balance - a.balance || b.volume - a.volume || a.name.localeCompare(b.name),
    )
    .map(({ volume: _volume, ...person }) => person);

  const byActivity = emptyActivityTotals();
  let owed = 0;
  if (countWork) {
    for (const line of counts) addWorkCount(byActivity, line.activity);
    for (const line of earnings) {
      owed += line.amount_inr;
      addMoney(byActivity, line.activity, line.amount_inr);
    }
  } else {
    for (const line of earnings) {
      owed += line.amount_inr;
      addActivity(byActivity, line);
    }
  }
  const paid = money(paidRows.reduce((sum, row) => sum + row.amount_inr, 0));
  owed = money(owed);
  fillHow(byActivity, earnings);

  const disbursements: StatementDisbursement[] = [...paidRows]
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.id.localeCompare(a.id))
    .map((row) => {
      const person = names.get(row.payee_id);
      return {
        id: row.id,
        payee_id: row.payee_id,
        payee_name: person?.name ?? 'Unknown',
        payee_role: person?.role ?? '',
        amount_inr: money(row.amount_inr),
        paid_on: row.paid_on,
        note: row.note,
        proof_name: row.proof_name,
        proof_bucket: row.proof_bucket,
        proof_path: row.proof_path,
        signed_url: args.signedUrls?.[row.id] ?? null,
      };
    });

  return {
    currency: 'INR',
    from: args.from,
    to: args.to,
    totals: {
      owed,
      paid,
      balance: money(owed - paid),
      entry_count: countWork ? counts.length : earnings.length,
    },
    by_activity: byActivity.filter((row) => row.count > 0),
    people,
    disbursements,
    pending_count: args.pending.length,
  };
}
