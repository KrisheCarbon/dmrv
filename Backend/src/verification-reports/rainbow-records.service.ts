import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  assessRainbowCredits,
  canAccessCarbon,
  MIN_BIOMASS_SEQUESTRATION,
  RAINBOW_HCORG_MAX,
  type RainbowCreditDelivery,
  type RainbowCreditRun,
  type RainbowYearFactors,
} from '@krishecarbon/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import { buildRainbowPackage, type RainbowPackage } from './rainbow-package';

export interface LabPayload {
  pyrolysis_batch_id?: string;
  organic_carbon_percent?: number;
  hcorg?: number;
  lab_name?: string;
  analyzed_on?: string;
  report_url?: string | null;
}

export interface PollutantPayload {
  feedstock_id?: string;
  test_year?: number;
  lead_mg_kg?: number;
  cadmium_mg_kg?: number;
  copper_mg_kg?: number;
  nickel_mg_kg?: number;
  mercury_mg_kg?: number;
  zinc_mg_kg?: number;
  chromium_mg_kg?: number;
  arsenic_mg_kg?: number;
  tested_on?: string;
  lab_name?: string;
  report_url?: string | null;
}

export interface MethanePayload {
  feedstock_id?: string;
  kontikki_id?: string;
  period_year?: number;
  measured_on?: string;
  kg_ch4_per_kg_biochar?: number;
  provider_name?: string;
  report_url?: string | null;
}

export interface EmissionPayload {
  feedstock_id?: string;
  period_year?: number;
  biomass_left_on_soil?: boolean;
  sequestration_rate?: number;
  biomass_carbon_fraction?: number | null;
  transport_tco2e?: number;
  kiln_steel_tco2e?: number;
  processing_tco2e?: number;
  notes?: string | null;
}

export interface SoilPayload {
  mixing_entry_id?: string;
  soil_temp_c?: number;
  source_note?: string | null;
}

function requiredText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${label} is required.`);
  return text;
}

function requiredNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${label} is required.`);
  return parsed;
}

function optionalUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  return text || null;
}

function yearNumber(value: unknown, label: string): number {
  const year = requiredNumber(value, label);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException(`${label} must be a year.`);
  }
  return year;
}

function nonNegative(value: unknown, label: string): number {
  const parsed = requiredNumber(value, label);
  if (parsed < 0) throw new BadRequestException(`${label} cannot be negative.`);
  return parsed;
}

@Injectable()
export class RainbowRecordsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  private assertAccess(user: AuthenticatedUser): void {
    if (!canAccessCarbon(user.role)) {
      throw new ForbiddenException('You do not have access to verification reports.');
    }
  }

  async inputs(user: AuthenticatedUser) {
    this.assertAccess(user);
    const [feedstocks, batches, mixing, kontikkis, labSamples, pollutants, methane, emissions, soilTemps] =
      await Promise.all([
        this.loadFeedstocks(),
        this.loadBatches(),
        this.loadMixing(),
        this.loadKontikkis(),
        this.loadTable('rainbow_batch_lab_samples', 'analyzed_on'),
        this.loadTable('rainbow_pollutant_tests', 'test_year'),
        this.loadTable('rainbow_methane_measurements', 'measured_on'),
        this.loadTable('rainbow_emission_inputs', 'period_year'),
        this.loadTable('rainbow_mixing_soil_temperature', 'mixing_entry_id'),
      ]);

    return {
      feedstocks,
      batches,
      mixing,
      kontikkis,
      labSamples,
      pollutants,
      methane,
      emissions,
      soilTemps,
    };
  }

  async saveLabSample(user: AuthenticatedUser, body: LabPayload) {
    this.assertAccess(user);
    const pyrolysisBatchId = requiredText(body.pyrolysis_batch_id, 'Kiln run');
    const organic = requiredNumber(body.organic_carbon_percent, 'Organic carbon');
    const hcorg = requiredNumber(body.hcorg, 'H/Corg');
    if (!(organic > 0 && organic <= 100)) {
      throw new BadRequestException('Organic carbon must be between 0 and 100%.');
    }
    if (!(hcorg > 0 && hcorg < RAINBOW_HCORG_MAX)) {
      throw new BadRequestException(
        'Rainbow H/Corg must be under 0.7. This is the kiln-run lab result, not the feedstock catalog H/C.',
      );
    }

    const { data: batch, error: batchError } = await this.supabase
      .from('rainbow_pyrolysis_batches')
      .select('id, submission_status')
      .eq('id', pyrolysisBatchId)
      .maybeSingle();
    if (batchError) throw new BadRequestException(batchError.message);
    if (!batch) throw new NotFoundException('Kiln run not found.');
    if (batch.submission_status !== 'submitted') {
      throw new BadRequestException('Save the lab sample on an uploaded kiln run.');
    }

    const row = {
      pyrolysis_batch_id: pyrolysisBatchId,
      organic_carbon_percent: organic,
      hcorg,
      lab_name: requiredText(body.lab_name, 'Laboratory'),
      analyzed_on: requiredText(body.analyzed_on, 'Analysis date'),
      report_url: optionalUrl(body.report_url),
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('rainbow_batch_lab_samples')
      .upsert(row, { onConflict: 'pyrolysis_batch_id' });
    if (error) throw new BadRequestException(error.message);
    return row;
  }

  async savePollutantTest(user: AuthenticatedUser, body: PollutantPayload) {
    this.assertAccess(user);
    const feedstockId = await this.requireFeedstock(body.feedstock_id);
    const row = {
      feedstock_id: feedstockId,
      test_year: yearNumber(body.test_year, 'Test year'),
      lead_mg_kg: nonNegative(body.lead_mg_kg, 'Lead'),
      cadmium_mg_kg: nonNegative(body.cadmium_mg_kg, 'Cadmium'),
      copper_mg_kg: nonNegative(body.copper_mg_kg, 'Copper'),
      nickel_mg_kg: nonNegative(body.nickel_mg_kg, 'Nickel'),
      mercury_mg_kg: nonNegative(body.mercury_mg_kg, 'Mercury'),
      zinc_mg_kg: nonNegative(body.zinc_mg_kg, 'Zinc'),
      chromium_mg_kg: nonNegative(body.chromium_mg_kg, 'Chromium'),
      arsenic_mg_kg: nonNegative(body.arsenic_mg_kg, 'Arsenic'),
      tested_on: requiredText(body.tested_on, 'Test date'),
      lab_name: requiredText(body.lab_name, 'Laboratory'),
      report_url: optionalUrl(body.report_url),
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('rainbow_pollutant_tests')
      .upsert(row, { onConflict: 'feedstock_id,test_year' });
    if (error) throw new BadRequestException(error.message);
    return row;
  }

  async saveMethane(user: AuthenticatedUser, body: MethanePayload) {
    this.assertAccess(user);
    const feedstockId = await this.requireFeedstock(body.feedstock_id);
    const kontikkiId = requiredText(body.kontikki_id, 'Kiln');
    const { data: kiln, error: kilnError } = await this.supabase
      .from('kontikkis')
      .select('id')
      .eq('id', kontikkiId)
      .maybeSingle();
    if (kilnError) throw new BadRequestException(kilnError.message);
    if (!kiln) throw new NotFoundException('Kiln not found.');

    const factor = requiredNumber(body.kg_ch4_per_kg_biochar, 'Methane');
    if (!(factor > 0)) {
      throw new BadRequestException('Methane must be kilograms of CH4 per kilogram of biochar, above zero.');
    }

    const row = {
      feedstock_id: feedstockId,
      kontikki_id: kontikkiId,
      period_year: yearNumber(body.period_year, 'Period year'),
      measured_on: requiredText(body.measured_on, 'Measurement date'),
      kg_ch4_per_kg_biochar: factor,
      provider_name: requiredText(body.provider_name, 'Measurement provider'),
      report_url: optionalUrl(body.report_url),
    };
    const { error } = await this.supabase.from('rainbow_methane_measurements').insert(row);
    if (error) throw new BadRequestException(error.message);
    return row;
  }

  async deleteMethane(user: AuthenticatedUser, id: string) {
    this.assertAccess(user);
    const { error } = await this.supabase
      .from('rainbow_methane_measurements')
      .delete()
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  async saveEmissions(user: AuthenticatedUser, body: EmissionPayload) {
    this.assertAccess(user);
    const leftOnSoil = body.biomass_left_on_soil === true;
    const rate = requiredNumber(body.sequestration_rate ?? MIN_BIOMASS_SEQUESTRATION, 'Sequestration rate');
    if (rate < MIN_BIOMASS_SEQUESTRATION) {
      throw new BadRequestException('Leakage sequestration must be at least 0.5% (0.005).');
    }
    let carbonFraction: number | null = null;
    if (leftOnSoil) {
      carbonFraction = requiredNumber(body.biomass_carbon_fraction, 'Feedstock carbon fraction');
      if (!(carbonFraction > 0 && carbonFraction <= 1)) {
        throw new BadRequestException('Feedstock carbon fraction must be between 0 and 1.');
      }
    }

    const row = {
      feedstock_id: await this.requireFeedstock(body.feedstock_id),
      period_year: yearNumber(body.period_year, 'Period year'),
      biomass_left_on_soil: leftOnSoil,
      sequestration_rate: rate,
      biomass_carbon_fraction: carbonFraction,
      transport_tco2e: nonNegative(body.transport_tco2e, 'Transport'),
      kiln_steel_tco2e: nonNegative(body.kiln_steel_tco2e, 'Kiln steel'),
      processing_tco2e: nonNegative(body.processing_tco2e, 'Chipping or drying'),
      notes: optionalUrl(body.notes),
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('rainbow_emission_inputs')
      .upsert(row, { onConflict: 'feedstock_id,period_year' });
    if (error) throw new BadRequestException(error.message);
    return row;
  }

  async saveSoilTemperature(user: AuthenticatedUser, body: SoilPayload) {
    this.assertAccess(user);
    const mixingEntryId = requiredText(body.mixing_entry_id, 'Mixing entry');
    const soilTemp = requiredNumber(body.soil_temp_c, 'Soil temperature');
    if (!(soilTemp > -20 && soilTemp < 50)) {
      throw new BadRequestException('Soil temperature must be between -20 and 50 °C.');
    }
    const { data: mixing, error: mixingError } = await this.supabase
      .from('rainbow_mixing_entries')
      .select('id')
      .eq('id', mixingEntryId)
      .maybeSingle();
    if (mixingError) throw new BadRequestException(mixingError.message);
    if (!mixing) throw new NotFoundException('Mixing entry not found.');

    const row = {
      mixing_entry_id: mixingEntryId,
      soil_temp_c: soilTemp,
      source_note: optionalUrl(body.source_note),
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from('rainbow_mixing_soil_temperature')
      .upsert(row, { onConflict: 'mixing_entry_id' });
    if (error) throw new BadRequestException(error.message);
    return row;
  }

  async buildPackage(user: AuthenticatedUser): Promise<RainbowPackage> {
    this.assertAccess(user);
    const snapshot = await this.inputs(user);
    const labByBatch = new Map(
      (snapshot.labSamples as Record<string, unknown>[]).map((row) => [
        String(row.pyrolysis_batch_id),
        row,
      ]),
    );
    const soilByMixing = new Map(
      (snapshot.soilTemps as Record<string, unknown>[]).map((row) => [
        String(row.mixing_entry_id),
        Number(row.soil_temp_c),
      ]),
    );

    const runs: RainbowCreditRun[] = (snapshot.batches as Record<string, unknown>[]).map((row) => {
      const lab = labByBatch.get(String(row.id));
      return {
        id: String(row.id),
        feedstockId: (row.feedstock_id as string) ?? null,
        feedstockName: (row.feedstock_name as string) || 'Feedstock',
        batchNumber: (row.batch_number as string) || String(row.id),
        feedstockKg: numberOrNull(row.feedstock_quantity),
        yieldPercent: numberOrNull(row.yield_percent),
        producedAt: (row.created_at as string) ?? null,
        organicCarbonPercent: lab ? numberOrNull(lab.organic_carbon_percent) : null,
        hcorg: lab ? numberOrNull(lab.hcorg) : null,
      };
    });

    const links = await this.loadLinks();
    const linksByMixing = new Map<string, string[]>();
    for (const link of links) {
      const list = linksByMixing.get(link.mixing_entry_id) ?? [];
      list.push(link.pyrolysis_batch_id);
      linksByMixing.set(link.mixing_entry_id, list);
    }

    const deliveries: RainbowCreditDelivery[] = (snapshot.mixing as Record<string, unknown>[])
      .map((row) => ({
        mixingEntryId: String(row.id),
        farmName: (row.farm_name as string) || String(row.id),
        appliedAt: (row.started_at as string) || (row.created_at as string),
        latitude: numberOrNull(row.location_lat),
        longitude: numberOrNull(row.location_lng),
        soilTempC: soilByMixing.get(String(row.id)) ?? null,
        runIds: linksByMixing.get(String(row.id)) ?? [],
      }))
      .filter((delivery) => delivery.runIds.length > 0);

    const years = this.yearFactors(snapshot);
    const lines = assessRainbowCredits({ runs, deliveries, years });
    const notes: string[] = [];
    if (!deliveries.length) {
      notes.push('No Rainbow mixing entries are linked to a kiln run yet.');
    }
    const missingLab = runs.filter((run) => run.hcorg == null || run.organicCarbonPercent == null).length;
    if (missingLab) {
      notes.push(`${missingLab} uploaded kiln run(s) still have no organic carbon and H/Corg lab sample.`);
    }
    return buildRainbowPackage({ lines, notes });
  }

  private yearFactors(snapshot: {
    pollutants: unknown[];
    methane: unknown[];
    emissions: unknown[];
  }): RainbowYearFactors[] {
    const keys = new Set<string>();
    const pollutants = snapshot.pollutants as Record<string, unknown>[];
    const methane = snapshot.methane as Record<string, unknown>[];
    const emissions = snapshot.emissions as Record<string, unknown>[];
    for (const row of [...pollutants, ...methane, ...emissions]) {
      const feedstockId = row.feedstock_id as string | undefined;
      const year = Number(row.test_year ?? row.period_year);
      if (feedstockId && Number.isInteger(year)) keys.add(`${feedstockId}:${year}`);
    }

    return [...keys].map((key) => {
      const [feedstockId, yearText] = key.split(':');
      const year = Number(yearText);
      const emission = emissions.find(
        (row) => row.feedstock_id === feedstockId && Number(row.period_year) === year,
      );
      return {
        feedstockId,
        year,
        pollutantRecorded: pollutants.some(
          (row) => row.feedstock_id === feedstockId && Number(row.test_year) === year,
        ),
        methaneSamples: methane
          .filter((row) => row.feedstock_id === feedstockId && Number(row.period_year) === year)
          .map((row) => ({
            kontikkiId: String(row.kontikki_id),
            kgCh4PerKgBiochar: Number(row.kg_ch4_per_kg_biochar),
          })),
        biomassLeftOnSoil: emission ? Boolean(emission.biomass_left_on_soil) : null,
        sequestrationRate: emission ? numberOrNull(emission.sequestration_rate) : null,
        biomassCarbonFraction: emission ? numberOrNull(emission.biomass_carbon_fraction) : null,
        transportTco2e: emission ? numberOrNull(emission.transport_tco2e) : null,
        kilnSteelTco2e: emission ? numberOrNull(emission.kiln_steel_tco2e) : null,
        processingTco2e: emission ? numberOrNull(emission.processing_tco2e) : null,
      };
    });
  }

  private async requireFeedstock(id: unknown): Promise<string> {
    const feedstockId = requiredText(id, 'Feedstock');
    const { data, error } = await this.supabase
      .from('feedstocks')
      .select('id')
      .eq('id', feedstockId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Feedstock not found.');
    return feedstockId;
  }

  private async loadFeedstocks() {
    const { data, error } = await this.supabase
      .from('feedstocks')
      .select('id, biomass_type, biochar_producer:biochar_producers(name)')
      .is('deleted_at', null)
      .order('biomass_type');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async loadBatches() {
    return fetchAllPages<Record<string, unknown>>((from, to) =>
      this.supabase
        .from('rainbow_pyrolysis_batches')
        .select(
          'id, batch_number, feedstock_id, feedstock_name, producer_name, feedstock_quantity, yield_percent, created_at, submission_status',
        )
        .eq('submission_status', 'submitted')
        .order('created_at', { ascending: false })
        .range(from, to),
    );
  }

  private async loadMixing() {
    return fetchAllPages<Record<string, unknown>>((from, to) =>
      this.supabase
        .from('rainbow_mixing_entries')
        .select('id, farm_name, started_at, location_lat, location_lng, created_at')
        .order('started_at', { ascending: false })
        .range(from, to),
    );
  }

  private async loadKontikkis() {
    const { data, error } = await this.supabase
      .from('kontikkis')
      .select('id, kontikki_code')
      .order('kontikki_code');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async loadLinks(): Promise<{ mixing_entry_id: string; pyrolysis_batch_id: string }[]> {
    return fetchAllPages((from, to) =>
      this.supabase
        .from('rainbow_mixing_pyrolysis_links')
        .select('mixing_entry_id, pyrolysis_batch_id')
        .range(from, to),
    );
  }

  private async loadTable(table: string, order: string) {
    const { data, error } = await this.supabase.from(table).select('*').order(order, { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
