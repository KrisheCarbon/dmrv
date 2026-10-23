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
  type BiomassCollectionRecord,
  type BiomassFarmOption,
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

  async listMappedFarms(user: AuthenticatedUser): Promise<BiomassFarmOption[]> {
    this.assertMobileAccess(user);
    return this.mobileNetwork.listMappedFarms(user);
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
    const farms = await this.mobileNetwork.listMappedFarms(user);
    const farm = farms.find((item) => item.id === payload.farm_id);
    if (!farm) {
      throw new BadRequestException(
        'Select an onboarded farm whose boundary has been mapped.',
      );
    }

    const check = checkLoadedPhotoNearFarm({
      farmName: payload.farm_name ?? farm.farmer_name,
      boundaries: farm.boundaries,
      latitude: payload.loaded_photo_metadata?.latitude,
      longitude: payload.loaded_photo_metadata?.longitude,
    });
    if (!check.ok) throw new BadRequestException(check.message);
  }

  private async withFarmDistances(
    records: BiomassCollectionRecord[],
  ): Promise<BiomassCollectionRecord[]> {
    const boundaries = await this.mobileNetwork.boundariesForFarms(
      records.map((record) => record.farm_id ?? ''),
    );

    return records.map((record) => {
      const rings = record.farm_id ? (boundaries.get(record.farm_id) ?? []) : [];
      const point = this.photoPoint(record.loaded_photo_metadata);
      const distanceM = point ? nearestBoundaryDistanceMeters(point, rings) : null;
      const summary = describeFarmPhotoDistance(distanceM, {
        hasBoundary: rings.length > 0,
        hasGps: point != null,
      });
      return {
        ...record,
        farm_has_mapped_boundary: rings.length > 0,
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
    if (!payload.farm_id) {
      throw new BadRequestException('Select the farm the biomass came from.');
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
