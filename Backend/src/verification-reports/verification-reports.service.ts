import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessCarbon } from '@krishecarbon/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { fetchAllPages } from '../supabase/fetch-all-pages';
import {
  buildCsiPackage,
  DEFAULT_CARBON_FRACTION,
  DEFAULT_CSI_REGISTRY,
  DEFAULT_HC_RATIO,
  type CsiPackage,
  type CsiRegistryConfig,
  type CsiSinkRow,
} from './csi-package';

interface FarmEmbed {
  farmer_code?: string | null;
  farmer_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface ApplicationRow {
  id: string;
  applied_at: string;
  farm_id: string | null;
  farm_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  farms: FarmEmbed | FarmEmbed[] | null;
}

interface LinkRow {
  application_entry_id: string;
  pyrolysis_batch_id: string;
}

interface BatchRow {
  id: string;
  feedstock_quantity: number | null;
  yield_percent: number | null;
  feedstock_id: string | null;
  created_at: string | null;
  stage_final_captured_at: string | null;
  pyrolysis_saved_at: string | null;
  location_lat: number | null;
  location_lng: number | null;
}

interface FeedstockRow {
  id: string;
  carbon_content_percent: number | null;
  hc_ratio: number | null;
  methane_compensation_strategy: string | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dryTonnes(feedstockKg: number | null, yieldPercent: number | null): number | null {
  if (feedstockKg == null || yieldPercent == null) return null;
  if (feedstockKg <= 0 || yieldPercent <= 0) return null;
  return (feedstockKg * (yieldPercent / 100)) / 1000;
}

function carbonFraction(percent: number | null): number | null {
  if (percent == null || percent <= 0) return null;
  return percent > 1 ? percent / 100 : percent;
}

function formatDdMmYyyy(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
  return parts.replace(/\//g, '.');
}

function methaneStrategy(value: string | null): string {
  if (value === 'offsetting_from_scp_fraction') return 'Offsetting from SCP fraction';
  return 'Avoidance - approved by CSI';
}

function registryConfig(): CsiRegistryConfig {
  return {
    ...DEFAULT_CSI_REGISTRY,
    projectId: process.env.CSI_PROJECT_ID || DEFAULT_CSI_REGISTRY.projectId,
    certificationId:
      process.env.CSI_CERTIFICATION_ID || DEFAULT_CSI_REGISTRY.certificationId,
    vvbName: process.env.CSI_VVB_NAME || DEFAULT_CSI_REGISTRY.vvbName,
    certificationDate:
      process.env.CSI_CERTIFICATION_DATE || DEFAULT_CSI_REGISTRY.certificationDate,
    certificateUrl:
      process.env.CSI_CERTIFICATE_URL || DEFAULT_CSI_REGISTRY.certificateUrl,
  };
}

@Injectable()
export class VerificationReportsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async buildCsiZip(user: AuthenticatedUser): Promise<CsiPackage> {
    if (!canAccessCarbon(user.role)) {
      throw new ForbiddenException('You do not have access to verification reports.');
    }

    const applications = await fetchAllPages<ApplicationRow>((from, to) =>
      this.supabase
        .from('application_entries')
        .select(
          'id, applied_at, farm_id, farm_name, location_lat, location_lng, farms(farmer_code, farmer_name, latitude, longitude)',
        )
        .order('applied_at', { ascending: true })
        .range(from, to),
    );

    const links = await this.loadLinks(applications.map((entry) => entry.id));
    const batches = await this.loadBatches(links.map((link) => link.pyrolysis_batch_id));
    const feedstocks = await this.loadFeedstocks(
      [...batches.values()]
        .map((batch) => batch.feedstock_id)
        .filter((id): id is string => Boolean(id)),
    );

    const linksByEntry = new Map<string, string[]>();
    for (const link of links) {
      const list = linksByEntry.get(link.application_entry_id) ?? [];
      list.push(link.pyrolysis_batch_id);
      linksByEntry.set(link.application_entry_id, list);
    }

    const rows: CsiSinkRow[] = [];
    const notes: string[] = [];
    const skipped: string[] = [];

    for (const entry of applications) {
      const built = this.toSinkRow(entry, linksByEntry.get(entry.id) ?? [], batches, feedstocks);
      if (!built) {
        skipped.push(entry.farm_name || entry.id);
        continue;
      }
      rows.push(built.row);
      if (built.note) notes.push(built.note);
    }

    if (skipped.length) {
      const shown = skipped.slice(0, 40).join(', ');
      const extra = skipped.length > 40 ? ` and ${skipped.length - 40} more` : '';
      notes.push(
        `Skipped ${skipped.length} application${skipped.length === 1 ? '' : 's'} with no biochar quantity (need a linked pyrolysis batch, feedstock kg, and yield): ${shown}${extra}.`,
      );
    }

    return buildCsiPackage({ rows, notes, config: registryConfig() });
  }

  private toSinkRow(
    entry: ApplicationRow,
    batchIds: string[],
    batches: Map<string, BatchRow>,
    feedstocks: Map<string, FeedstockRow>,
  ): { row: CsiSinkRow; note: string | null } | null {
    const farm = one(entry.farms);
    let dry = 0;
    let carbonWeighted = 0;
    let hcWeighted = 0;
    let usedDefaultLab = false;
    let strategy: string | null = null;
    let productionIso: string | null = null;
    let latitude = numberOrNull(entry.location_lat);
    let longitude = numberOrNull(entry.location_lng);
    let counted = 0;

    for (const batchId of batchIds) {
      const batch = batches.get(batchId);
      if (!batch) continue;
      const mass = dryTonnes(
        numberOrNull(batch.feedstock_quantity),
        numberOrNull(batch.yield_percent),
      );
      if (mass == null) continue;

      const feedstock = batch.feedstock_id ? feedstocks.get(batch.feedstock_id) : undefined;
      const fraction = carbonFraction(numberOrNull(feedstock?.carbon_content_percent));
      const hc = numberOrNull(feedstock?.hc_ratio);
      const labFraction = fraction ?? DEFAULT_CARBON_FRACTION;
      const labHc = hc != null && hc > 0 ? hc : DEFAULT_HC_RATIO;
      if (fraction == null || hc == null || hc <= 0) usedDefaultLab = true;
      if (!strategy) strategy = methaneStrategy(feedstock?.methane_compensation_strategy ?? null);

      dry += mass;
      carbonWeighted += labFraction * mass;
      hcWeighted += labHc * mass;
      counted += 1;

      const producedAt =
        batch.stage_final_captured_at || batch.pyrolysis_saved_at || batch.created_at;
      if (producedAt && (!productionIso || producedAt < productionIso)) {
        productionIso = producedAt;
      }
      if (latitude == null) latitude = numberOrNull(batch.location_lat);
      if (longitude == null) longitude = numberOrNull(batch.location_lng);
    }

    if (counted === 0 || dry <= 0) return null;

    if (latitude == null) latitude = numberOrNull(farm?.latitude);
    if (longitude == null) longitude = numberOrNull(farm?.longitude);

    const label = entry.farm_name || farm?.farmer_name || entry.id;
    return {
      row: {
        unitId: entry.id,
        farmerId: farm?.farmer_code || entry.farm_id || '',
        productionDate: formatDdMmYyyy(productionIso || entry.applied_at),
        sinkDate: formatDdMmYyyy(entry.applied_at),
        dryTonnes: dry,
        carbonFraction: carbonWeighted / dry,
        hcRatio: hcWeighted / dry,
        methaneStrategy: strategy || 'Avoidance - approved by CSI',
        latitude,
        longitude,
        usedDefaultLab,
      },
      note: usedDefaultLab
        ? `${label}: used default carbon content ${DEFAULT_CARBON_FRACTION} and/or H/Corg ${DEFAULT_HC_RATIO} because a linked batch has no feedstock lab result.`
        : null,
    };
  }

  private async loadLinks(entryIds: string[]): Promise<LinkRow[]> {
    const rows: LinkRow[] = [];
    for (const group of chunks(entryIds, 150)) {
      const { data, error } = await this.supabase
        .from('application_pyrolysis_links')
        .select('application_entry_id, pyrolysis_batch_id')
        .in('application_entry_id', group);
      if (error) throw new BadRequestException(error.message);
      rows.push(...((data ?? []) as LinkRow[]));
    }
    return rows;
  }

  private async loadBatches(batchIds: string[]): Promise<Map<string, BatchRow>> {
    const map = new Map<string, BatchRow>();
    const unique = [...new Set(batchIds)];
    for (const group of chunks(unique, 150)) {
      const { data, error } = await this.supabase
        .from('csi_pyrolysis_batches')
        .select(
          'id, feedstock_quantity, yield_percent, feedstock_id, created_at, stage_final_captured_at, pyrolysis_saved_at, location_lat, location_lng',
        )
        .in('id', group);
      if (error) throw new BadRequestException(error.message);
      for (const row of (data ?? []) as BatchRow[]) {
        map.set(row.id, row);
      }
    }
    return map;
  }

  private async loadFeedstocks(feedstockIds: string[]): Promise<Map<string, FeedstockRow>> {
    const map = new Map<string, FeedstockRow>();
    const unique = [...new Set(feedstockIds)];
    for (const group of chunks(unique, 150)) {
      const { data, error } = await this.supabase
        .from('feedstocks')
        .select('id, carbon_content_percent, hc_ratio, methane_compensation_strategy')
        .in('id', group);
      if (error) throw new BadRequestException(error.message);
      for (const row of (data ?? []) as FeedstockRow[]) {
        map.set(row.id, row);
      }
    }
    return map;
  }
}
