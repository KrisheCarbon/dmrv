import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canAccessMobileApp,
  isDmrvViewer,
  biomassAcresLimitMessage,
  checkLoadedPhotoNearFarm,
  describeFarmPhotoDistance,
  nearestBoundaryDistanceMeters,
  parseBiomassQuantity,
  parseBoundaryGeojson,
  polygonAreaAcres,
  type ApplicationFarmFieldOption,
  type ApplicationFarmerOption,
  type BiomassCollectionRecord,
  type BiomassCollectionSource,
  type CreateBiomassCollectionPayload,
  type FieldPhotoMetadata,
  type GeoPoint,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';
import { clusterPeerIds } from '../farms/farm-visibility';

const COLLECTION_SELECT = `
  id,
  operator_id,
  farm_id,
  farm_name,
  farm_field_id,
  field_code,
  producer_id,
  producer_site_id,
  producer_name,
  tractor_number,
  loaded_at,
  loaded_photo_url,
  loaded_photo_metadata,
  unloaded_at,
  unloaded_photo_url,
  unloaded_photo_metadata,
  status,
  created_at,
  updated_at,
  users:operator_id (
    id,
    full_name
  )
`;

@Injectable()
export class BiomassCollectionsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly mobileNetwork: MobileNetworkService,
  ) {}

  async listMappedFarms(user: AuthenticatedUser): Promise<ApplicationFarmerOption[]> {
    this.assertMobileAccess(user);
    return this.mobileNetwork.listApplicationFarms(user);
  }

  async listFarmerNames(user: AuthenticatedUser) {
    this.assertMobileAccess(user);
    return this.mobileNetwork.listFarmerNames(user);
  }

  async listFarmerFields(user: AuthenticatedUser, farmId: string) {
    this.assertMobileAccess(user);
    return this.mobileNetwork.listFarmerFields(user, farmId);
  }

  async listDropSites(user: AuthenticatedUser) {
    this.assertMobileAccess(user);
    return this.mobileNetwork.listDropSites(user);
  }

  /** Acres already collected on each farm plot, across every trip. */
  async usedAcres(user: AuthenticatedUser): Promise<{ farm_field_id: string; used_acres: number }[]> {
    this.assertMobileAccess(user);
    const totals = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase
        .from('biomass_collection_sources')
        .select('farm_field_id, acres')
        .range(from, from + 999);
      if (error) throw new BadRequestException(error.message);
      for (const row of data ?? []) {
        const fieldId = String(row.farm_field_id ?? '');
        const acres = Number(row.acres);
        if (!fieldId || !Number.isFinite(acres)) continue;
        totals.set(fieldId, (totals.get(fieldId) ?? 0) + acres);
      }
      if (!data || data.length < 1000) break;
    }
    return [...totals.entries()].map(([farm_field_id, used_acres]) => ({
      farm_field_id,
      used_acres,
    }));
  }

  async listCollections(user: AuthenticatedUser): Promise<BiomassCollectionRecord[]> {
    let query = this.supabase
      .from('biomass_collections')
      .select(COLLECTION_SELECT)
      .order('loaded_at', { ascending: false });

    if (!this.seesEveryCollection(user)) {
      this.assertMobileAccess(user);
      const peers = await clusterPeerIds(this.supabase, user);
      if (peers) query = query.in('operator_id', peers);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    const records = (data ?? []).map((row) => this.mapRow(row));
    await this.attachSources(records);
    return this.withFarmDistances(records);
  }

  async getCollection(user: AuthenticatedUser, id: string): Promise<BiomassCollectionRecord> {
    let query = this.supabase.from('biomass_collections').select(COLLECTION_SELECT).eq('id', id);

    if (!this.seesEveryCollection(user)) {
      this.assertMobileAccess(user);
      const peers = await clusterPeerIds(this.supabase, user);
      if (peers) query = query.in('operator_id', peers);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Biomass collection not found.');
    const mapped = this.mapRow(data);
    await this.attachSources([mapped]);
    const [record] = await this.withFarmDistances([mapped]);
    if (!record) throw new NotFoundException('Biomass collection not found.');
    return record;
  }

  async createCollection(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
  ): Promise<BiomassCollectionRecord> {
    this.assertMobileAccess(user);
    const dropSite = await this.resolveDropSite(user, payload);
    const resolved = { ...payload, ...dropSite };
    const sources = this.normalizeSources(resolved);
    this.validateCreatePayload(resolved, sources);
    await this.assertLoadedPhotoNearFarm(user, resolved, sources);
    await this.assertAcresWithinFarms(user, sources);
    const first = sources[0];

    const { data, error } = await this.supabase
      .from('biomass_collections')
      .insert({
        operator_id: user.id,
        farm_id: first?.farm_id ?? resolved.farm_id,
        farm_name: first?.farm_name ?? resolved.farm_name ?? null,
        farm_field_id: first?.farm_field_id ?? resolved.farm_field_id,
        field_code: (first?.field_code ?? resolved.field_code)?.trim() || null,
        producer_id: resolved.producer_id,
        producer_site_id: resolved.producer_site_id ?? null,
        producer_name: resolved.producer_name ?? null,
        tractor_number: resolved.tractor_number?.trim() || null,
        loaded_at: resolved.loaded_at,
        loaded_photo_url: resolved.loaded_photo_url,
        loaded_photo_metadata: resolved.loaded_photo_metadata ?? null,
        unloaded_at: resolved.unloaded_at,
        unloaded_photo_url: resolved.unloaded_photo_url,
        unloaded_photo_metadata: resolved.unloaded_photo_metadata ?? null,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not save biomass collection.');
    }

    if (sources.length > 0) {
      const { error: sourceError } = await this.supabase.from('biomass_collection_sources').insert(
        sources.map((source) => ({
          biomass_collection_id: data.id,
          farm_id: source.farm_id,
          farm_name: source.farm_name ?? null,
          farm_field_id: source.farm_field_id,
          field_code: source.field_code?.trim() || null,
          acres: source.acres,
          biomass_tonnes: source.biomass_tonnes,
        })),
      );
      if (sourceError) {
        await this.supabase.from('biomass_collections').delete().eq('id', data.id);
        throw new BadRequestException(sourceError.message);
      }
    }

    return this.getCollection(user, String(data.id));
  }

  private normalizeSources(payload: CreateBiomassCollectionPayload): BiomassCollectionSource[] {
    const raw = Array.isArray(payload.sources) ? payload.sources : [];
    if (raw.length === 0) return [];
    return raw.map((source) => ({
      farm_id: String(source.farm_id ?? ''),
      farm_name: source.farm_name ?? null,
      farm_field_id: String(source.farm_field_id ?? ''),
      field_code: source.field_code ?? null,
      acres: Number(source.acres),
      biomass_tonnes: parseBiomassQuantity(source.biomass_tonnes),
    }));
  }

  /** Boundaries for the farms on this trip only. */
  private async plotsForFarms(
    user: AuthenticatedUser,
    farmIds: string[],
  ): Promise<Map<string, ApplicationFarmFieldOption[]>> {
    const plots = new Map<string, ApplicationFarmFieldOption[]>();
    for (const farmId of farmIds) {
      if (!farmId || plots.has(farmId)) continue;
      try {
        plots.set(farmId, await this.mobileNetwork.listFarmerFields(user, farmId));
      } catch {
        plots.set(farmId, []);
      }
    }
    return plots;
  }

  private async assertLoadedPhotoNearFarm(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
    sources: BiomassCollectionSource[],
  ) {
    const chosen = sources.length
      ? sources
      : [
          {
            farm_id: payload.farm_id,
            farm_name: payload.farm_name,
            farm_field_id: payload.farm_field_id,
            field_code: payload.field_code,
            acres: 0,
            biomass_tonnes: null,
          },
        ];
    const plots = await this.plotsForFarms(
      user,
      chosen.map((source) => source.farm_id),
    );
    const boundaries: GeoPoint[][] = [];
    const names: string[] = [];
    for (const source of chosen) {
      const field = (plots.get(source.farm_id) ?? []).find((item) => item.id === source.farm_field_id);
      if (!field) {
        throw new BadRequestException('Select the farmer and the farm plot.');
      }
      boundaries.push(field.boundary);
      names.push(`${source.farm_name ?? 'Farm'} (${field.field_code})`);
    }

    const check = checkLoadedPhotoNearFarm({
      farmName: names.join(', '),
      boundaries,
      latitude: payload.loaded_photo_metadata?.latitude,
      longitude: payload.loaded_photo_metadata?.longitude,
    });
    if (!check.ok) throw new BadRequestException(check.message);
  }

  private async assertAcresWithinFarms(
    user: AuthenticatedUser,
    sources: BiomassCollectionSource[],
  ) {
    if (sources.length === 0) return;
    const seen = new Set<string>();
    for (const source of sources) {
      if (seen.has(source.farm_field_id)) {
        throw new BadRequestException(
          'Each farm can be added once. Increase the acres on the farm already in this trip.',
        );
      }
      seen.add(source.farm_field_id);
    }

    const used = await this.usedAcres(user);
    const usedByField = new Map(used.map((row) => [row.farm_field_id, row.used_acres]));
    const added = new Map<string, number>();
    const plots = await this.plotsForFarms(
      user,
      sources.map((source) => source.farm_id),
    );

    for (const source of sources) {
      const field = (plots.get(source.farm_id) ?? []).find((item) => item.id === source.farm_field_id);
      if (!field) {
        throw new BadRequestException('Select the farmer and the farm plot.');
      }
      const acres = parseBiomassQuantity(source.acres);
      const tonnes = parseBiomassQuantity(source.biomass_tonnes);
      if (acres == null) {
        throw new BadRequestException('Enter the acres collected from each farm.');
      }
      const already = (usedByField.get(field.id) ?? 0) + (added.get(field.id) ?? 0);
      const message = biomassAcresLimitMessage({
        farmLabel: `${source.farm_name ?? 'Farm'} (${field.field_code})`,
        areaAcres: field.area_acres,
        alreadyUsedAcres: already,
        nextAcres: acres,
      });
      if (message) throw new BadRequestException(message);
      added.set(field.id, (added.get(field.id) ?? 0) + acres);
      source.acres = acres;
      source.biomass_tonnes = tonnes;
      source.farm_name = source.farm_name ?? null;
      source.field_code = source.field_code ?? field.field_code;
    }
  }

  private async withFarmDistances(
    records: BiomassCollectionRecord[],
  ): Promise<BiomassCollectionRecord[]> {
    const fieldIds = [
      ...new Set(
        records.flatMap((record) => [
          record.farm_field_id,
          ...(record.sources ?? []).map((source) => source.farm_field_id),
        ]).filter((id): id is string => Boolean(id)),
      ),
    ];
    const plots = new Map<string, { ring: GeoPoint[]; acres: number }>();

    for (let offset = 0; offset < fieldIds.length; offset += 80) {
      const chunk = fieldIds.slice(offset, offset + 80);
      const { data, error } = await this.supabase
        .from('farm_fields')
        .select('id, boundary_geojson')
        .in('id', chunk);
      if (error) throw new BadRequestException(error.message);
      for (const row of data ?? []) {
        const ring = parseBoundaryGeojson(
          row.boundary_geojson as string | Record<string, unknown> | null,
        );
        if (ring.length < 3) continue;
        plots.set(String(row.id), { ring, acres: polygonAreaAcres(ring) });
      }
    }

    const fallbackIds = records
      .filter((record) => !record.farm_field_id && record.farm_id)
      .map((record) => record.farm_id as string);
    const fallback = await this.mobileNetwork.boundariesForFarms(fallbackIds);

    return records.map((record) => {
      for (const source of record.sources ?? []) {
        source.area_acres = plots.get(source.farm_field_id)?.acres ?? null;
      }
      const sourcePlots = (record.sources ?? [])
        .map((source) => plots.get(source.farm_field_id))
        .filter((plot): plot is { ring: GeoPoint[]; acres: number } => Boolean(plot));
      const plot = record.farm_field_id ? plots.get(record.farm_field_id) : sourcePlots[0];
      const rings = sourcePlots.length
        ? sourcePlots.map((item) => item.ring)
        : plot
          ? [plot.ring]
          : record.farm_id
            ? (fallback.get(record.farm_id) ?? [])
            : [];
      const point = this.photoPoint(record.loaded_photo_metadata);
      const distanceM = point ? nearestBoundaryDistanceMeters(point, rings) : null;
      const summary = describeFarmPhotoDistance(distanceM, {
        hasBoundary: rings.length > 0,
        hasGps: point != null,
      });
      return {
        ...record,
        farm_has_mapped_boundary: rings.length > 0,
        farm_area_acres: plot?.acres ?? null,
        loaded_distance_from_farm_m: summary.distanceM,
      };
    });
  }

  private photoPoint(metadata?: FieldPhotoMetadata | null): GeoPoint | null {
    const latitude = Number(metadata?.latitude);
    const longitude = Number(metadata?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }

  private async attachSources(records: BiomassCollectionRecord[]) {
    const ids = records.map((record) => record.id);
    if (ids.length === 0) return;
    const sourcesByCollection = new Map<string, BiomassCollectionSource[]>();
    for (let offset = 0; offset < ids.length; offset += 80) {
      const chunk = ids.slice(offset, offset + 80);
      const { data, error } = await this.supabase
        .from('biomass_collection_sources')
        .select('id, biomass_collection_id, farm_id, farm_name, farm_field_id, field_code, acres, biomass_tonnes')
        .in('biomass_collection_id', chunk);
      if (error) throw new BadRequestException(error.message);
      for (const row of data ?? []) {
        const collectionId = String(row.biomass_collection_id);
        const list = sourcesByCollection.get(collectionId) ?? [];
        list.push({
          id: String(row.id),
          farm_id: String(row.farm_id),
          farm_name: (row.farm_name as string) ?? null,
          farm_field_id: String(row.farm_field_id),
          field_code: (row.field_code as string) ?? null,
          acres: Number(row.acres),
          biomass_tonnes:
            row.biomass_tonnes == null || row.biomass_tonnes === ''
              ? null
              : Number(row.biomass_tonnes),
        });
        sourcesByCollection.set(collectionId, list);
      }
    }
    for (const record of records) {
      record.sources = sourcesByCollection.get(record.id) ?? [];
    }
  }

  /** A dropping site must belong to a producer linked to this person's cluster. */
  private async resolveDropSite(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
  ): Promise<Pick<CreateBiomassCollectionPayload, 'producer_id' | 'producer_name' | 'producer_site_id'>> {
    if (!payload.producer_site_id) {
      return {
        producer_id: payload.producer_id,
        producer_name: payload.producer_name,
        producer_site_id: null,
      };
    }

    const { data, error } = await this.supabase
      .from('producer_sites')
      .select('id, site_name, biochar_producer_id')
      .eq('id', payload.producer_site_id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data?.biochar_producer_id) {
      throw new BadRequestException('Select the dropping site.');
    }

    const allowed = await this.mobileNetwork.producerIdsForUser(user);
    if (allowed && !allowed.includes(String(data.biochar_producer_id))) {
      throw new BadRequestException('That dropping site is not on a producer linked to your cluster.');
    }

    const siteName = (data.site_name as string | null)?.trim() || payload.producer_name || null;
    return {
      producer_id: String(data.biochar_producer_id),
      producer_name: siteName,
      producer_site_id: String(data.id),
    };
  }

  private validateCreatePayload(
    payload: CreateBiomassCollectionPayload,
    sources: BiomassCollectionSource[],
  ) {
    if (sources.length === 0 && (!payload.farm_id || !payload.farm_field_id)) {
      throw new BadRequestException('Select the farmer and the farm plot.');
    }
    if (sources.length === 0 && Array.isArray(payload.sources)) {
      throw new BadRequestException('Add at least one farm.');
    }
    if (!payload.producer_id) {
      throw new BadRequestException('Select the production site where it was unloaded.');
    }
    if (!payload.loaded_at || !payload.loaded_photo_url?.trim()) {
      throw new BadRequestException('The loaded tractor photo is required.');
    }
    if (!payload.unloaded_at || !payload.unloaded_photo_url?.trim()) {
      throw new BadRequestException('The unloaded photo at the production site is required.');
    }
  }

  private mapRow(row: Record<string, unknown>): BiomassCollectionRecord {
    const operator = this.unwrap(row.users) as { full_name?: string | null } | null;

    return {
      id: String(row.id),
      operator_id: String(row.operator_id),
      operator_name: operator?.full_name?.trim() || null,
      farm_id: (row.farm_id as string) ?? null,
      farm_name: (row.farm_name as string) ?? null,
      farm_field_id: (row.farm_field_id as string) ?? null,
      field_code: (row.field_code as string) ?? null,
      producer_id: (row.producer_id as string) ?? null,
      producer_site_id: (row.producer_site_id as string) ?? null,
      producer_name: (row.producer_name as string) ?? null,
      tractor_number: (row.tractor_number as string) ?? null,
      loaded_at: String(row.loaded_at),
      loaded_photo_url: String(row.loaded_photo_url),
      loaded_photo_metadata:
        (row.loaded_photo_metadata as BiomassCollectionRecord['loaded_photo_metadata']) ?? null,
      unloaded_at: String(row.unloaded_at),
      unloaded_photo_url: String(row.unloaded_photo_url),
      unloaded_photo_metadata:
        (row.unloaded_photo_metadata as BiomassCollectionRecord['unloaded_photo_metadata']) ??
        null,
      status: 'submitted',
      created_at: row.created_at as string | undefined,
      updated_at: row.updated_at as string | undefined,
    };
  }

  private seesEveryCollection(user: AuthenticatedUser) {
    return user.role === 'admin' || user.role === 'manager' || isDmrvViewer(user.role);
  }

  private unwrap<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private assertMobileAccess(user: AuthenticatedUser) {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to access biomass collections.');
    }
  }
}
