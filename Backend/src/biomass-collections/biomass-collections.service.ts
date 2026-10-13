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
  isDmrvViewer,
  type BiomassCollectionRecord,
  type CreateBiomassCollectionPayload,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

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
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

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
    return (data ?? []).map((row) => this.mapRow(row));
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
    return this.mapRow(data);
  }

  async createCollection(
    user: AuthenticatedUser,
    payload: CreateBiomassCollectionPayload,
  ): Promise<BiomassCollectionRecord> {
    this.assertMobileAccess(user);
    this.validateCreatePayload(payload);

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
    return canAccessWebPortal(user.role) && !isDmrvViewer(user.role);
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
