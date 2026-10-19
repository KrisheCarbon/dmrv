import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser } from '../auth/auth.types';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import {
  buildStatement,
  priceCountedWork,
  priceFarmRegistration,
} from './payments.calc';
import {
  ACTIVITY_LABELS,
  FARM_BASES,
  FARM_BASIS_LABELS,
  PAYMENT_ACTIVITIES,
  PAYMENT_SCOPES,
  type FarmBasis,
  type FarmerWork,
  type PaymentActivity,
  type PaymentScope,
  type PaymentStatement,
  type RateCardRecord,
  type RateCardWrite,
  type RateInput,
  type WorkLocation,
} from './payments.types';

const PAYEE_ROLES = ['climapreneur', 'supervisor'] as const;
const PROOF_BUCKET = 'payment-proofs';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 10_000_000;

interface UserRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
}

interface FarmRow {
  id: string;
  farmer_name: string | null;
  created_by: string | null;
  assigned_to: string | null;
  cluster_id: string | null;
  cluster_village_id: string | null;
  village: string | null;
  total_land_size: number | string | null;
  owned_land_size: number | string | null;
  leased_land_size: number | string | null;
  created_at: string;
}

interface FieldRow {
  id: string;
  farm_id: string;
  field_code: string | null;
  calculated_area: number | string | null;
  status: string | null;
  created_at: string;
  created_by: string | null;
}

function positive(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
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

export function toIndiaDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DATE_RE.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

export function todayIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function declaredArea(farm: FarmRow): number {
  const total = positive(farm.total_land_size);
  if (total > 0) return total;
  return positive(farm.owned_land_size) + positive(farm.leased_land_size);
}

@Injectable()
export class PaymentsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async options(user: AuthenticatedUser) {
    this.assertManager(user);
    const [producers, villages, clusters, producerClusters, payees] = await Promise.all([
      fetchAllPages<{ id: string; name: string | null }>((from, to) =>
        this.supabase
          .from('biochar_producers')
          .select('id, name')
          .order('name')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        village_name: string | null;
        cluster_id: string;
      }>((from, to) =>
        this.supabase
          .from('cluster_villages')
          .select('id, village_name, cluster_id')
          .order('village_name')
          .range(from, to),
      ),
      fetchAllPages<{ id: string; name: string | null }>((from, to) =>
        this.supabase.from('clusters').select('id, name').range(from, to),
      ),
      fetchAllPages<{ biochar_producer_id: string; cluster_id: string }>((from, to) =>
        this.supabase
          .from('biochar_producer_clusters')
          .select('biochar_producer_id, cluster_id')
          .range(from, to),
      ),
      this.loadPayees(),
    ]);
    const clusterNames = new Map(clusters.map((cluster) => [cluster.id, cluster.name?.trim() || 'Cluster']));
    const villagesByCluster = new Map<string, { id: string; name: string }[]>();
    const villageOptions = villages
      .map((village) => ({
        id: village.id,
        name: village.village_name?.trim() || 'Unnamed village',
        cluster_name: clusterNames.get(village.cluster_id) ?? 'Cluster',
        cluster_id: village.cluster_id,
      }))
      .sort((a, b) => a.cluster_name.localeCompare(b.cluster_name) || a.name.localeCompare(b.name));
    for (const village of villageOptions) {
      const list = villagesByCluster.get(village.cluster_id) ?? [];
      list.push({ id: village.id, name: village.name });
      villagesByCluster.set(village.cluster_id, list);
    }
    const clustersByProducer = new Map<string, string[]>();
    for (const link of producerClusters) {
      const list = clustersByProducer.get(link.biochar_producer_id) ?? [];
      list.push(link.cluster_id);
      clustersByProducer.set(link.biochar_producer_id, list);
    }

    return {
      activities: PAYMENT_ACTIVITIES.map((activity) => ({
        activity,
        label: ACTIVITY_LABELS[activity],
      })),
      farm_bases: FARM_BASES.map((basis) => ({
        basis,
        label: FARM_BASIS_LABELS[basis],
      })),
      producers: producers
        .map((producer) => {
          const seen = new Set<string>();
          const nested: { id: string; name: string }[] = [];
          for (const clusterId of clustersByProducer.get(producer.id) ?? []) {
            for (const village of villagesByCluster.get(clusterId) ?? []) {
              if (seen.has(village.id)) continue;
              seen.add(village.id);
              nested.push(village);
            }
          }
          nested.sort((a, b) => a.name.localeCompare(b.name));
          return {
            id: producer.id,
            name: producer.name?.trim() || 'Unnamed site',
            villages: nested,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      villages: villageOptions.map(({ id, name, cluster_name }) => ({ id, name, cluster_name })),
      payees: payees.map((payee) => ({
        id: payee.id,
        name: personName(payee),
        role: payee.role,
      })),
    };
  }

  async listRateCards(user: AuthenticatedUser): Promise<RateCardRecord[]> {
    this.assertManager(user);
    return this.loadRateCards();
  }

  async createRateCard(user: AuthenticatedUser, body: unknown): Promise<RateCardRecord> {
    this.assertManager(user);
    const payload = this.parseCard(body);
    const { data, error } = await this.supabase
      .from('payment_rate_cards')
      .insert({
        name: payload.name,
        scope: payload.scope,
        effective_from: payload.effective_from,
        effective_to: payload.effective_to,
        notes: payload.notes,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not save the rate card.');
    }
    const id = data.id as string;
    try {
      await this.replaceChildren(id, payload);
    } catch (err) {
      await this.supabase.from('payment_rate_cards').delete().eq('id', id);
      throw err;
    }
    return this.requireCard(id);
  }

  async updateRateCard(
    user: AuthenticatedUser,
    id: string,
    body: unknown,
  ): Promise<RateCardRecord> {
    this.assertManager(user);
    this.assertUuid(id);
    const payload = this.parseCard(body);
    const { error } = await this.supabase
      .from('payment_rate_cards')
      .update({
        name: payload.name,
        scope: payload.scope,
        effective_from: payload.effective_from,
        effective_to: payload.effective_to,
        notes: payload.notes,
      })
      .eq('id', id)
      .eq('status', 'active');
    if (error) throw new BadRequestException(error.message);
    const existing = await this.requireCard(id);
    if (existing.status !== 'active') {
      throw new BadRequestException('Restore this rate card before editing it.');
    }
    await this.replaceChildren(id, payload);
    return this.requireCard(id);
  }

  async archiveRateCard(user: AuthenticatedUser, id: string) {
    return this.setStatus(user, id, 'archived');
  }

  async restoreRateCard(user: AuthenticatedUser, id: string) {
    return this.setStatus(user, id, 'active');
  }

  async statement(
    user: AuthenticatedUser,
    query: { from?: string; to?: string; payee_id?: string },
  ): Promise<PaymentStatement> {
    this.assertReader(user);
    const from = this.optionalDate(query.from, 'From');
    const to = this.optionalDate(query.to, 'To');
    if (from && to && to < from) {
      throw new BadRequestException('The end date is before the start date.');
    }

    const canManage = this.isManager(user);
    const requestedPayee = query.payee_id?.trim() || null;
    if (requestedPayee) this.assertUuid(requestedPayee);
    const payeeFilter = canManage ? requestedPayee : user.id;

    const calculated = await this.calculate(payeeFilter);
    const names = await this.loadPayees();
    const signedUrls = await this.signProofs(calculated.disbursements);

    const built = buildStatement({
      earnings: calculated.earnings,
      counts: calculated.counts,
      pending: calculated.pending,
      disbursements: calculated.disbursements,
      people: names.map((person) => ({
        id: person.id,
        name: personName(person),
        role: person.role,
      })),
      from,
      to,
      signedUrls,
    });

    return {
      ...built,
      rates_active: calculated.ratesActive,
      viewer: {
        id: user.id,
        role: user.role,
        can_manage: canManage,
        scope: canManage && !payeeFilter ? 'all' : 'self',
      },
      totals: {
        ...built.totals,
        unattributed: calculated.unattributed,
      },
    };
  }

  async createDisbursement(user: AuthenticatedUser, body: unknown) {
    this.assertManager(user);
    const payload = this.parseDisbursement(body);
    const payees = await this.loadPayees();
    if (!payees.some((payee) => payee.id === payload.payee_id)) {
      throw new BadRequestException('Choose a climapreneur or a supervisor.');
    }

    const { data, error } = await this.supabase
      .from('payment_disbursements')
      .insert({
        payee_id: payload.payee_id,
        amount_inr: payload.amount_inr,
        paid_on: payload.paid_on,
        note: payload.note,
        proof_bucket: PROOF_BUCKET,
        proof_path: payload.proof_path,
        proof_name: payload.proof_name,
        created_by: user.id,
      })
      .select('id, payee_id, amount_inr, paid_on, note, proof_name, proof_path')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not record the payment.');
    }
    return data;
  }

  private async calculate(payeeFilter: string | null): Promise<{
    earnings: import('./payments.types').EarningLine[];
    counts: import('./payments.types').WorkCount[];
    pending: import('./payments.types').PendingLine[];
    disbursements: import('./payments.calc').DisbursementRow[];
    unattributed: number;
    ratesActive: boolean;
  }> {
    const [
      cards,
      payees,
      farms,
      fields,
      soilTests,
      csiSessions,
      rainbowSessions,
      csiBatches,
      rainbowBatches,
      kontikkis,
      csiMixing,
      rainbowMixing,
      biomass,
      applications,
      producerLinks,
      disbursements,
    ] = await Promise.all([
      this.loadRateCards('active'),
      this.loadPayees(),
      fetchAllPages<FarmRow>((from, to) =>
        this.supabase
          .from('farms')
          .select(
            'id, farmer_name, created_by, assigned_to, cluster_id, cluster_village_id, village, total_land_size, owned_land_size, leased_land_size, created_at',
          )
          .range(from, to),
      ),
      fetchAllPages<FieldRow>((from, to) =>
        this.supabase
          .from('farm_fields')
          .select('id, farm_id, field_code, calculated_area, status, created_at, created_by')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        farm_id: string;
        collected_by: string | null;
        created_by: string | null;
        sample_date: string | null;
        created_at: string;
      }>((from, to) =>
        this.supabase
          .from('soil_tests')
          .select('id, farm_id, collected_by, created_by, sample_date, created_at')
          .range(from, to),
      ),
      fetchAllPages<{ id: string; operator_id: string | null }>((from, to) =>
        this.supabase.from('csi_pyrolysis_sessions').select('id, operator_id').range(from, to),
      ),
      fetchAllPages<{ id: string; operator_id: string | null }>((from, to) =>
        this.supabase.from('rainbow_pyrolysis_sessions').select('id, operator_id').range(from, to),
      ),
      fetchAllPages<{
        id: string;
        session_id: string;
        kontikki_id: string;
        batch_number: string | null;
        submission_status: string | null;
        created_at: string;
        yield_saved_at: string | null;
      }>((from, to) =>
        this.supabase
          .from('csi_pyrolysis_batches')
          .select(
            'id, session_id, kontikki_id, batch_number, submission_status, created_at, yield_saved_at',
          )
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        session_id: string;
        producer_id: string | null;
        batch_number: string | null;
        submission_status: string | null;
        created_at: string;
        yield_saved_at: string | null;
      }>((from, to) =>
        this.supabase
          .from('rainbow_pyrolysis_batches')
          .select(
            'id, session_id, producer_id, batch_number, submission_status, created_at, yield_saved_at',
          )
          .range(from, to),
      ),
      fetchAllPages<{ id: string; biochar_producer_id: string | null }>((from, to) =>
        this.supabase.from('kontikkis').select('id, biochar_producer_id').range(from, to),
      ),
      fetchAllPages<{
        id: string;
        operator_id: string | null;
        farm_id: string | null;
        started_at: string;
        status: string | null;
      }>((from, to) =>
        this.supabase
          .from('csi_mixing_entries')
          .select('id, operator_id, farm_id, started_at, status')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        operator_id: string | null;
        farm_id: string | null;
        started_at: string;
        status: string | null;
      }>((from, to) =>
        this.supabase
          .from('rainbow_mixing_entries')
          .select('id, operator_id, farm_id, started_at, status')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        operator_id: string | null;
        farm_id: string | null;
        producer_id: string | null;
        loaded_at: string;
      }>((from, to) =>
        this.supabase
          .from('biomass_collections')
          .select('id, operator_id, farm_id, producer_id, loaded_at')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        operator_id: string | null;
        farm_id: string | null;
        applied_at: string;
      }>((from, to) =>
        this.supabase
          .from('application_entries')
          .select('id, operator_id, farm_id, applied_at')
          .range(from, to),
      ),
      fetchAllPages<{ biochar_producer_id: string; cluster_id: string }>((from, to) =>
        this.supabase
          .from('biochar_producer_clusters')
          .select('biochar_producer_id, cluster_id')
          .range(from, to),
      ),
      fetchAllPages<{
        id: string;
        payee_id: string;
        amount_inr: number | string;
        paid_on: string;
        note: string | null;
        proof_name: string | null;
        proof_bucket: string | null;
        proof_path: string | null;
      }>((from, to) =>
        this.supabase
          .from('payment_disbursements')
          .select('id, payee_id, amount_inr, paid_on, note, proof_name, proof_bucket, proof_path')
          .range(from, to),
      ),
    ]);

    const payeeIds = new Set(payees.map((payee) => payee.id));
    const keepPayee = (id: string | null | undefined): id is string =>
      Boolean(id && payeeIds.has(id) && (!payeeFilter || id === payeeFilter));

    const producersByCluster = new Map<string, string[]>();
    for (const link of producerLinks) {
      const list = producersByCluster.get(link.cluster_id) ?? [];
      list.push(link.biochar_producer_id);
      producersByCluster.set(link.cluster_id, list);
    }

    const villages = await fetchAllPages<{ id: string; village_name: string | null }>((from, to) =>
      this.supabase.from('cluster_villages').select('id, village_name').range(from, to),
    );
    const producers = await fetchAllPages<{ id: string; name: string | null }>((from, to) =>
      this.supabase.from('biochar_producers').select('id, name').range(from, to),
    );
    const villageNames = new Map(villages.map((village) => [village.id, village.village_name?.trim() || '']));
    const producerNames = new Map(producers.map((producer) => [producer.id, producer.name?.trim() || 'Site']));

    const farmById = new Map(farms.map((farm) => [farm.id, farm]));
    const locationOf = (farm: FarmRow | undefined, extraProducer?: string | null): WorkLocation => {
      const fromCluster = farm?.cluster_id ? (producersByCluster.get(farm.cluster_id) ?? []) : [];
      const producerIds = [...new Set([...fromCluster, extraProducer].filter((id): id is string => Boolean(id)))];
      return {
        producer_ids: producerIds,
        village_id: farm?.cluster_village_id ?? null,
      };
    };
    const placeOf = (location: WorkLocation, farm?: FarmRow): string => {
      const village =
        (farm?.cluster_village_id ? villageNames.get(farm.cluster_village_id) : null) ||
        farm?.village?.trim() ||
        '';
      const site = location.producer_ids.map((id) => producerNames.get(id)).filter(Boolean)[0] ?? '';
      return [site, village].filter(Boolean).join(' · ') || '—';
    };

    let unattributed = 0;
    const noteUnattributed = (id: string | null | undefined) => {
      if (id && !payeeIds.has(id)) unattributed += 1;
    };

    const asOf = todayIndia();
    const activeCards = cards;
    const earnings: import('./payments.types').EarningLine[] = [];
    const counts: import('./payments.types').WorkCount[] = [];
    const pending: import('./payments.types').PendingLine[] = [];
    const noteWork = (
      payeeId: string,
      activity: import('./payments.types').PaymentActivity,
      occurredOn: string,
    ) => {
      counts.push({ payee_id: payeeId, activity, occurred_on: occurredOn });
    };

    const fieldsByFarm = new Map<string, FieldRow[]>();
    for (const field of fields) {
      if (field.status === 'inactive' || field.status === 'deleted') continue;
      const list = fieldsByFarm.get(field.farm_id) ?? [];
      list.push(field);
      fieldsByFarm.set(field.farm_id, list);
    }

    for (const farm of farms) {
      const owner = farm.assigned_to || farm.created_by;
      const registeredOn = toIndiaDate(farm.created_at);
      if (!registeredOn) continue;
      const location = locationOf(farm);
      const place = placeOf(location, farm);
      const label = farm.farmer_name?.trim() || 'Farmer';

      if (!keepPayee(owner)) {
        noteUnattributed(owner);
      } else {
        const farmerLine = priceCountedWork(activeCards, {
          id: farm.id,
          payee_id: owner,
          activity: 'farmer_registration',
          label,
          occurred_on: registeredOn,
          location,
          place,
        });
        if (farmerLine) earnings.push(farmerLine);
        noteWork(owner, 'farmer_registration', registeredOn);

        const work: FarmerWork = {
          id: farm.id,
          payee_id: owner,
          label,
          registered_on: registeredOn,
          location,
          place,
          registered_area: declaredArea(farm),
          fields: (fieldsByFarm.get(farm.id) ?? []).flatMap((field) => {
            const createdOn = toIndiaDate(field.created_at);
            if (!createdOn) return [];
            return [
              {
                id: field.id,
                created_on: createdOn,
                area: positive(field.calculated_area),
                label: field.field_code?.trim() ? `Plot ${field.field_code.trim()}` : 'Farm plot',
              },
            ];
          }),
        };
        const priced = priceFarmRegistration(activeCards, work, asOf);
        earnings.push(...priced.earned);
        if (priced.pending) pending.push(priced.pending);
        for (const field of work.fields) {
          noteWork(owner, 'farm_registration', field.created_on);
        }
      }
    }

    for (const test of soilTests) {
      const actor = test.collected_by || test.created_by;
      const farm = farmById.get(test.farm_id);
      const occurred = toIndiaDate(test.sample_date) || toIndiaDate(test.created_at);
      if (!occurred) continue;
      if (!keepPayee(actor)) {
        noteUnattributed(actor);
        continue;
      }
      const location = locationOf(farm);
      const line = priceCountedWork(activeCards, {
        id: test.id,
        payee_id: actor,
        activity: 'soil_sample',
        label: farm?.farmer_name?.trim() || 'Soil sample',
        occurred_on: occurred,
        location,
        place: placeOf(location, farm),
      });
      if (line) earnings.push(line);
      noteWork(actor, 'soil_sample', occurred);
    }

    const operatorBySession = new Map<string, string | null>([
      ...csiSessions.map((session) => [session.id, session.operator_id] as const),
      ...rainbowSessions.map((session) => [session.id, session.operator_id] as const),
    ]);
    const producerByKontikki = new Map(
      kontikkis.map((kontikki) => [kontikki.id, kontikki.biochar_producer_id]),
    );

    for (const batch of csiBatches) {
      if (batch.submission_status !== 'submitted') continue;
      const actor = operatorBySession.get(batch.session_id) ?? null;
      const producerId = producerByKontikki.get(batch.kontikki_id) ?? null;
      const occurred = toIndiaDate(batch.yield_saved_at) || toIndiaDate(batch.created_at);
      if (!occurred) continue;
      if (!keepPayee(actor)) {
        noteUnattributed(actor);
        continue;
      }
      const location: WorkLocation = {
        producer_ids: producerId ? [producerId] : [],
        village_id: null,
      };
      const line = priceCountedWork(activeCards, {
        id: batch.id,
        payee_id: actor,
        activity: 'pyrolysis_batch',
        label: batch.batch_number?.trim() || 'Pyrolysis batch',
        occurred_on: occurred,
        location,
        place: producerId ? (producerNames.get(producerId) ?? 'Site') : '—',
      });
      if (line) earnings.push(line);
      noteWork(actor, 'pyrolysis_batch', occurred);
    }

    for (const batch of rainbowBatches) {
      if (batch.submission_status !== 'submitted') continue;
      const actor = operatorBySession.get(batch.session_id) ?? null;
      const occurred = toIndiaDate(batch.yield_saved_at) || toIndiaDate(batch.created_at);
      if (!occurred) continue;
      if (!keepPayee(actor)) {
        noteUnattributed(actor);
        continue;
      }
      const location: WorkLocation = {
        producer_ids: batch.producer_id ? [batch.producer_id] : [],
        village_id: null,
      };
      const line = priceCountedWork(activeCards, {
        id: batch.id,
        payee_id: actor,
        activity: 'pyrolysis_batch',
        label: batch.batch_number?.trim() || 'Pyrolysis batch',
        occurred_on: occurred,
        location,
        place: batch.producer_id ? (producerNames.get(batch.producer_id) ?? 'Site') : '—',
      });
      if (line) earnings.push(line);
      noteWork(actor, 'pyrolysis_batch', occurred);
    }

    const pushFarmLinked = (
      activity: PaymentActivity,
      row: {
        id: string;
        operator_id: string | null;
        farm_id: string | null;
        occurred: string | null;
        label: string;
        extraProducer?: string | null;
      },
    ) => {
      if (!row.occurred) return;
      if (!keepPayee(row.operator_id)) {
        noteUnattributed(row.operator_id);
        return;
      }
      const farm = row.farm_id ? farmById.get(row.farm_id) : undefined;
      const location = locationOf(farm, row.extraProducer);
      const line = priceCountedWork(activeCards, {
        id: row.id,
        payee_id: row.operator_id,
        activity,
        label: row.label,
        occurred_on: row.occurred,
        location,
        place: placeOf(location, farm),
      });
      if (line) earnings.push(line);
      noteWork(row.operator_id, activity, row.occurred);
    };

    for (const entry of [...csiMixing, ...rainbowMixing]) {
      if (entry.status === 'draft') continue;
      pushFarmLinked('mixing_batch', {
        id: entry.id,
        operator_id: entry.operator_id,
        farm_id: entry.farm_id,
        occurred: toIndiaDate(entry.started_at),
        label: 'Mixing batch',
      });
    }

    for (const entry of biomass) {
      pushFarmLinked('biomass_collection', {
        id: entry.id,
        operator_id: entry.operator_id,
        farm_id: entry.farm_id,
        occurred: toIndiaDate(entry.loaded_at),
        label: 'Biomass collection',
        extraProducer: entry.producer_id,
      });
    }

    for (const entry of applications) {
      pushFarmLinked('application', {
        id: entry.id,
        operator_id: entry.operator_id,
        farm_id: entry.farm_id,
        occurred: toIndiaDate(entry.applied_at),
        label: 'Application',
      });
    }

    return {
      earnings: payeeFilter ? earnings.filter((line) => line.payee_id === payeeFilter) : earnings,
      counts: payeeFilter ? counts.filter((line) => line.payee_id === payeeFilter) : counts,
      pending: payeeFilter ? pending.filter((line) => line.payee_id === payeeFilter) : pending,
      disbursements: disbursements
        .filter((row) => !payeeFilter || row.payee_id === payeeFilter)
        .map((row) => ({
          id: row.id,
          payee_id: row.payee_id,
          amount_inr: positive(row.amount_inr),
          paid_on: toIndiaDate(row.paid_on) ?? row.paid_on.slice(0, 10),
          note: row.note,
          proof_name: row.proof_name,
          proof_bucket: row.proof_bucket,
          proof_path: row.proof_path,
        })),
      unattributed: payeeFilter ? 0 : unattributed,
      ratesActive: activeCards.length > 0,
    };
  }

  private async signProofs(
    rows: { id: string; proof_bucket: string | null; proof_path: string | null }[],
  ): Promise<Record<string, string | null>> {
    const signed: Record<string, string | null> = {};
    await Promise.all(
      rows.map(async (row) => {
        if (!row.proof_bucket || !row.proof_path) {
          signed[row.id] = null;
          return;
        }
        const { data } = await this.supabase.storage
          .from(row.proof_bucket)
          .createSignedUrl(row.proof_path, 60 * 60);
        signed[row.id] = data?.signedUrl ?? null;
      }),
    );
    return signed;
  }

  private async loadPayees(): Promise<UserRow[]> {
    return fetchAllPages<UserRow>((from, to) =>
      this.supabase
        .from('users')
        .select('id, full_name, first_name, last_name, role')
        .in('role', [...PAYEE_ROLES])
        .range(from, to),
    );
  }

  private async loadRateCards(status?: 'active' | 'archived'): Promise<RateCardRecord[]> {
    let request = this.supabase
      .from('payment_rate_cards')
      .select(
        'id, name, scope, effective_from, effective_to, notes, status, created_at, payment_rate_card_producers(producer_id), payment_rate_card_villages(cluster_village_id), payment_rates(activity, amount_inr, farm_basis)',
      )
      .order('effective_from', { ascending: false });
    if (status) request = request.eq('status', status);

    const { data, error } = await request;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => this.mapCard(row as Record<string, unknown>));
  }

  private mapCard(row: Record<string, unknown>): RateCardRecord {
    const producers = (row.payment_rate_card_producers as { producer_id: string }[] | null) ?? [];
    const villages =
      (row.payment_rate_card_villages as { cluster_village_id: string }[] | null) ?? [];
    const rates = (row.payment_rates as { activity: PaymentActivity; amount_inr: number | string; farm_basis: FarmBasis | null }[] | null) ?? [];
    return {
      id: String(row.id),
      name: String(row.name),
      scope: row.scope as PaymentScope,
      effective_from: String(row.effective_from).slice(0, 10),
      effective_to: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
      notes: (row.notes as string | null) ?? null,
      status: row.status === 'archived' ? 'archived' : 'active',
      producer_ids: producers.map((item) => item.producer_id),
      village_ids: villages.map((item) => item.cluster_village_id),
      rates: rates.map((rate) => ({
        activity: rate.activity,
        amount_inr: Number(rate.amount_inr),
        farm_basis: rate.farm_basis,
      })),
      created_at: String(row.created_at),
    };
  }

  private async requireCard(id: string): Promise<RateCardRecord> {
    const cards = await this.loadRateCards();
    const card = cards.find((item) => item.id === id);
    if (!card) throw new NotFoundException('Rate card not found.');
    return card;
  }

  private async replaceChildren(id: string, payload: RateCardWrite) {
    const { error: rateError } = await this.supabase.from('payment_rates').delete().eq('rate_card_id', id);
    if (rateError) throw new BadRequestException(rateError.message);
    const { error: producerError } = await this.supabase
      .from('payment_rate_card_producers')
      .delete()
      .eq('rate_card_id', id);
    if (producerError) throw new BadRequestException(producerError.message);
    const { error: villageError } = await this.supabase
      .from('payment_rate_card_villages')
      .delete()
      .eq('rate_card_id', id);
    if (villageError) throw new BadRequestException(villageError.message);

    if (payload.producer_ids.length > 0) {
      const { error } = await this.supabase.from('payment_rate_card_producers').insert(
        payload.producer_ids.map((producerId) => ({ rate_card_id: id, producer_id: producerId })),
      );
      if (error) throw new BadRequestException(error.message);
    }
    if (payload.village_ids.length > 0) {
      const { error } = await this.supabase.from('payment_rate_card_villages').insert(
        payload.village_ids.map((villageId) => ({
          rate_card_id: id,
          cluster_village_id: villageId,
        })),
      );
      if (error) throw new BadRequestException(error.message);
    }
    const { error } = await this.supabase.from('payment_rates').insert(
      payload.rates.map((rate) => ({
        rate_card_id: id,
        activity: rate.activity,
        amount_inr: rate.amount_inr,
        farm_basis: rate.activity === 'farm_registration' ? rate.farm_basis : null,
      })),
    );
    if (error) throw new BadRequestException(error.message);
  }

  private async setStatus(user: AuthenticatedUser, id: string, status: 'active' | 'archived') {
    this.assertManager(user);
    this.assertUuid(id);
    const { data, error } = await this.supabase
      .from('payment_rate_cards')
      .update({ status })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Rate card not found.');
    return this.requireCard(id);
  }

  private parseCard(body: unknown): RateCardWrite {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Rate card details are missing.');
    }
    const raw = body as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 120) {
      throw new BadRequestException('Give the rate card a name.');
    }
    const scope = raw.scope;
    if (!PAYMENT_SCOPES.includes(scope as PaymentScope)) {
      throw new BadRequestException('Choose where this rate applies.');
    }
    const effectiveFrom = this.requireDate(raw.effective_from, 'Start date');
    const effectiveTo = this.optionalDate(
      typeof raw.effective_to === 'string' ? raw.effective_to : null,
      'End date',
    );
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('The end date is before the start date.');
    }
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) : '';
    const producerIds = this.idList(raw.producer_ids);
    const villageIds = this.idList(raw.village_ids);
    if (scope === 'producers' && producerIds.length === 0) {
      throw new BadRequestException('Select at least one producer site.');
    }
    if (scope === 'villages' && villageIds.length === 0 && producerIds.length === 0) {
      throw new BadRequestException('Select at least one producer or village.');
    }

    if (!Array.isArray(raw.rates) || raw.rates.length === 0) {
      throw new BadRequestException('Add an amount for at least one activity.');
    }
    const seen = new Set<string>();
    const rates: RateInput[] = [];
    for (const item of raw.rates) {
      if (!item || typeof item !== 'object') continue;
      const rate = item as Record<string, unknown>;
      const activity = rate.activity;
      if (!PAYMENT_ACTIVITIES.includes(activity as PaymentActivity)) {
        throw new BadRequestException('One of the activities is not recognised.');
      }
      if (seen.has(activity as string)) {
        throw new BadRequestException('Each activity can only be priced once on a rate card.');
      }
      seen.add(activity as string);
      const amount = Number(rate.amount_inr);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        throw new BadRequestException(`Enter an amount for ${ACTIVITY_LABELS[activity as PaymentActivity]}.`);
      }
      let farmBasis: FarmBasis | null = null;
      if (activity === 'farm_registration') {
        if (!FARM_BASES.includes(rate.farm_basis as FarmBasis)) {
          throw new BadRequestException('Choose when a farm registration is paid.');
        }
        farmBasis = rate.farm_basis as FarmBasis;
      }
      rates.push({
        activity: activity as PaymentActivity,
        amount_inr: Math.round(amount * 100) / 100,
        farm_basis: farmBasis,
      });
    }
    if (rates.length === 0) {
      throw new BadRequestException('Add an amount for at least one activity.');
    }

    return {
      name,
      scope: scope as PaymentScope,
      producer_ids: scope === 'all_producers' ? [] : producerIds,
      village_ids: scope === 'villages' ? villageIds : [],
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      notes: notes || null,
      rates,
    };
  }

  private parseDisbursement(body: unknown): {
    payee_id: string;
    amount_inr: number;
    paid_on: string;
    note: string | null;
    proof_path: string;
    proof_name: string;
  } {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payment details are missing.');
    }
    const raw = body as Record<string, unknown>;
    const payeeId = typeof raw.payee_id === 'string' ? raw.payee_id : '';
    this.assertUuid(payeeId);
    const amount = Number(raw.amount_inr);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new BadRequestException('Enter the amount that was paid.');
    }
    const paidOn = this.requireDate(raw.paid_on, 'Payment date');
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 2000) : '';
    const proofPath = typeof raw.proof_path === 'string' ? raw.proof_path.trim() : '';
    const proofName = typeof raw.proof_name === 'string' ? raw.proof_name.trim().slice(0, 180) : '';
    if (!proofPath || proofPath.includes('..') || !proofPath.startsWith(`${payeeId}/`)) {
      throw new BadRequestException('Upload a screenshot, invoice, or other proof of payment.');
    }
    return {
      payee_id: payeeId,
      amount_inr: Math.round(amount * 100) / 100,
      paid_on: paidOn,
      note: note || null,
      proof_path: proofPath,
      proof_name: proofName || 'Proof',
    };
  }

  private idList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const ids = value.filter((item): item is string => typeof item === 'string' && UUID_RE.test(item));
    return [...new Set(ids)];
  }

  private requireDate(value: unknown, label: string): string {
    if (typeof value !== 'string' || !DATE_RE.test(value)) {
      throw new BadRequestException(`${label} is required.`);
    }
    return value;
  }

  private optionalDate(value: string | null | undefined, label: string): string | null {
    if (!value) return null;
    if (!DATE_RE.test(value)) throw new BadRequestException(`${label} is not a valid date.`);
    return value;
  }

  private assertUuid(value: string) {
    if (!UUID_RE.test(value)) throw new BadRequestException('That record was not found.');
  }

  private isManager(user: AuthenticatedUser): boolean {
    return user.role === 'admin' || user.role === 'manager';
  }

  private assertManager(user: AuthenticatedUser) {
    if (!this.isManager(user)) {
      throw new ForbiddenException('Only an admin or a manager can change payments.');
    }
  }

  private assertReader(user: AuthenticatedUser) {
    if (!this.isManager(user) && !PAYEE_ROLES.includes(user.role as (typeof PAYEE_ROLES)[number])) {
      throw new ForbiddenException('You cannot view payments.');
    }
  }
}
