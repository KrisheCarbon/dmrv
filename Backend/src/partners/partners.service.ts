import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessNetwork } from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export type PartnerStatus = 'active' | 'inactive' | 'draft';

export interface PartnerRecord {
  id: string;
  org_name: string;
  cin_number?: string | null;
  base_location?: string | null;
  farmer_base?: number | null;
  status?: PartnerStatus | string | null;
  states_of_operation?: string[] | null;
  crop_types?: string[] | null;
  bank_account_holders_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_address?: string | null;
  pan_card_url?: string | null;
  mou_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  last_modified_at?: string | null;
  deleted_at?: string | null;
}

export interface CreatePartnerPayload {
  org_name: string;
  cin_number?: string | null;
  base_location: string;
  farmer_base: number;
  states_of_operation: string[];
  crop_types: string[];
  bank_account_holders_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  bank_address: string;
  pan_card_url?: string | null;
  mou_url?: string | null;
  status?: PartnerStatus;
}

export interface UpdatePartnerPayload extends Partial<CreatePartnerPayload> {}

const PARTNER_LIST_SELECT = `
  id,
  org_name,
  cin_number,
  base_location,
  farmer_base,
  status,
  last_modified_at
`;

const PARTNER_DETAIL_SELECT = '*';

@Injectable()
export class PartnersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Not allowed to manage partners');
    }
  }

  async findAll(user: AuthenticatedUser): Promise<PartnerRecord[]> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('partner_organizations')
      .select(PARTNER_LIST_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []) as PartnerRecord[];
  }

  async findById(user: AuthenticatedUser, id: string): Promise<PartnerRecord> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('partner_organizations')
      .select(PARTNER_DETAIL_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Partner not found');
    }

    return data as PartnerRecord;
  }

  async create(
    user: AuthenticatedUser,
    payload: CreatePartnerPayload,
  ): Promise<PartnerRecord> {
    this.assertCanManage(user);
    this.validatePartnerPayload(payload);

    const { data, error } = await this.supabase
      .from('partner_organizations')
      .insert({
        ...payload,
        status: payload.status ?? 'inactive',
        created_by: user.id,
        last_modified_at: new Date().toISOString(),
      })
      .select(PARTNER_DETAIL_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data as PartnerRecord;
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: UpdatePartnerPayload,
  ): Promise<PartnerRecord> {
    this.assertCanManage(user);
    await this.ensurePartnerExists(id);

    const { data, error } = await this.supabase
      .from('partner_organizations')
      .update({
        ...payload,
        last_modified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select(PARTNER_DETAIL_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Partner not found');
    }

    return data as PartnerRecord;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);
    await this.ensurePartnerExists(id);

    const { error } = await this.supabase
      .from('partner_organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private validatePartnerPayload(payload: CreatePartnerPayload): void {
    if (!payload.org_name?.trim()) {
      throw new BadRequestException('Organisation name is required.');
    }
    if (!payload.base_location?.trim()) {
      throw new BadRequestException('Base location is required.');
    }
    if (!payload.states_of_operation?.length) {
      throw new BadRequestException('States of operation are required.');
    }
    if (!payload.crop_types?.length) {
      throw new BadRequestException('Crop types are required.');
    }
  }

  private async ensurePartnerExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('partner_organizations')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Partner not found');
    }
  }
}
