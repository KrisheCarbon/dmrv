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
  canAccessWebPortal,
  checkLoadedPhotoNearFarm,
  describeFarmPhotoDistance,
  nearestBoundaryDistanceMeters,
  parseBoundaryGeojson,
  polygonAreaAcres,
  type ApplicationFarmerOption,
  type BiomassCollectionRecord,
  type CreateBiomassCollectionPayload,
  type FieldPhotoMetadata,
  type GeoPoint,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MobileNetworkService } from '../mobile-network/mobile-network.service';

const COLLECTION_SELECT = `
  id,
  operator_id,
  farm_id,
  farm_name,
  farm_field_id,
  field_code,
  producer_id,
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

  async listCollections(user: AuthenticatedUser): Promise<BiomassCollectionRecord[]> {
    let query = this.supabase
      .from('biomass_collections')
      .select(COLLECTION_SELECT)
      .order('loaded_at', { ascending: false });

    if (!this.isPortalReader(user)) {
      this.assertMobileAccess(user);
      query = query.eq('operator_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return this.withFarmDistances((data ?? []).map((row) => this.mapRow(row)));
  }

  async getCollection(user: AuthenticatedUser, id: string): Promise<BiomassCollectionRecord> {
    let query = this.supabase.from('biomass_collections').select(COLLECTION_SELECT).eq('id', id);

    if (!this.isPortalReader(user)) {
      this.assertMobileAccess(user);
      query = query.eq('operator_id', user.id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Biomass collection not found.');
    const [record] = await this.withFarmDistances([this.mapRow(data)]);
    if (!record) throw new NotFoundException('Biomass collection not found.');
    return record;
  }

  async createCollection(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
  ): Promise<BiomassCollectionRecord> {
    this.assertMobileAccess(user);
    this.validateCreatePayload(payload);
    await this.assertLoadedPhotoNearFarm(user, payload);

    const { data, error } = await this.supabase
      .from('biomass_collections')
      .insert({
        operator_id: user.id,
        farm_id: payload.farm_id,
        farm_name: payload.farm_name ?? null,
        farm_field_id: payload.farm_field_id,
        field_code: payload.field_code?.trim() || null,
        producer_id: payload.producer_id,
        producer_name: payload.producer_name ?? null,
        tractor_number: payload.tractor_number?.trim() || null,
        loaded_at: payload.loaded_at,
        loaded_photo_url: payload.loaded_photo_url,
        loaded_photo_metadata: payload.loaded_photo_metadata ?? null,
        unloaded_at: payload.unloaded_at,
        unloaded_photo_url: payload.unloaded_photo_url,
        unloaded_photo_metadata: payload.unloaded_photo_metadata ?? null,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not save biomass collection.');
    }

    return this.getCollection(user, String(data.id));
  }

  private async assertLoadedPhotoNearFarm(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
  ) {
    const farmers = await this.mobileNetwork.listApplicationFarms(user);
    const farmer = farmers.find((item) => item.id === payload.farm_id);
    const field = farmer?.fields.find((item) => item.id === payload.farm_field_id);
    if (!farmer || !field) {
      throw new BadRequestException('Select the farmer and the farm plot.');
    }

    const check = checkLoadedPhotoNearFarm({
      farmName: `${payload.farm_name ?? farmer.farmer_name} (${field.field_code})`,
      boundaries: [field.boundary],
      latitude: payload.loaded_photo_metadata?.latitude,
      longitude: payload.loaded_photo_metadata?.longitude,
    });
    if (!check.ok) throw new BadRequestException(check.message);
  }

  private async withFarmDistances(
    records: BiomassCollectionRecord[],
  ): Promise<BiomassCollectionRecord[]> {
    const fieldIds = [
      ...new Set(
        records.map((record) => record.farm_field_id).filter((id): id is string => Boolean(id)),
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
      const plot = record.farm_field_id ? plots.get(record.farm_field_id) : undefined;
      const rings = plot ? [plot.ring] : record.farm_id ? (fallback.get(record.farm_id) ?? []) : [];
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

  private validateCreatePayload(payload: CreateBiomassCollectionPayload) {
    if (!payload.farm_id || !payload.farm_field_id) {
      throw new BadRequestException('Select the farmer and the farm plot.');
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

  private isPortalReader(user: AuthenticatedUser) {
    return canAccessWebPortal(user.role);
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
