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
  type FarmUpsertPayload,
  type Farmer,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class FarmsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async findAll(user: AuthenticatedUser): Promise<Farmer[]> {
    let query = this.supabase
      .from('farms')
      .select('*')
      .order('created_at', { ascending: false });

    if (!canAccessWebPortal(user.role)) {
      query = query.or(
        `created_by.eq.${user.id},assigned_to.eq.${user.id}`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []) as Farmer[];
  }

  async findById(user: AuthenticatedUser, id: string): Promise<Farmer> {
    const { data, error } = await this.supabase
      .from('farms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Farm not found');
    }

    if (!this.canViewFarm(user, data as Farmer)) {
      throw new ForbiddenException('Not allowed to view this farm');
    }

    return data as Farmer;
  }

  async create(
    user: AuthenticatedUser,
    payload: FarmUpsertPayload,
  ): Promise<Farmer> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to create farms');
    }

    const { data, error } = await this.supabase
      .from('farms')
      .insert({
        ...payload,
        created_by: user.id,
        assigned_to: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data as Farmer;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: FarmUpsertPayload,
  ): Promise<Farmer> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to update farms');
    }

    const { data, error } = await this.supabase
      .from('farms')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Farm not found');
    }

    return data as Farmer;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    if (!canAccessMobileApp(user.role)) {
      throw new ForbiddenException('Not allowed to delete farms');
    }

    const { error } = await this.supabase.from('farms').delete().eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private canViewFarm(user: AuthenticatedUser, farm: Farmer): boolean {
    if (canAccessWebPortal(user.role)) {
      return true;
    }

    return farm.created_by === user.id || farm.assigned_to === user.id;
  }
}
