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

export type KontikkiStatus = 'active' | 'inactive';

export interface KontikkiOperatorAssignment {
  operator_id: string;
  users?: {
    id: string;
    full_name?: string | null;
    role?: string;
  } | null;
}

export interface KontikkiRecord {
  id: string;
  kontikki_code: string;
  module_id: string | null;
  status: KontikkiStatus;
  biochar_producer_id: string | null;
  kp_number: string | null;
  top_diameter_cm: number | null;
  bottom_diameter_cm: number | null;
  depth_cm: number | null;
  capacity: number | null;
  top_photo_url: string | null;
  side_photo_url: string | null;
  top_photo_urls?: string[] | null;
  bottom_photo_urls?: string[] | null;
  plan_pdf_url: string | null;
  created_at?: string;
  updated_at?: string;
  biochar_producer?:
    | { id: string; name?: string; producer_code?: string | null }
    | { id: string; name?: string; producer_code?: string | null }[]
    | null;
  kontikki_operators?: KontikkiOperatorAssignment[];
}

export interface CreateKontikkiPayload {
  kontikki_code: string;
  module_id?: string | null;
  biochar_producer_id: string;
  status: KontikkiStatus;
  top_diameter_cm: number;
  bottom_diameter_cm: number;
  depth_cm: number;
  capacity: number;
  operator_ids?: string[];
  plan_pdf_url?: string | null;
  top_photo_urls?: string[];
  bottom_photo_urls?: string[];
}

export interface UpdateKontikkiPayload {
  kontikki_code?: string;
  module_id?: string | null;
  biochar_producer_id?: string;
  status?: KontikkiStatus;
  top_diameter_cm?: number;
  bottom_diameter_cm?: number;
  depth_cm?: number;
  capacity?: number;
  operator_ids?: string[];
  plan_pdf_url?: string | null;
  top_photo_urls?: string[];
  bottom_photo_urls?: string[];
}

const KONTIKKI_OPERATORS_SELECT = `
  kontikki_operators (
    operator_id,
    users (
      id,
      full_name,
      role
    )
  )
`;

const KONTIKKI_LIST_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  capacity,
  top_diameter_cm,
  bottom_diameter_cm,
  depth_cm,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name
  ),
  ${KONTIKKI_OPERATORS_SELECT}
`;

const KONTIKKI_DETAIL_SELECT = `
  id,
  kontikki_code,
  module_id,
  status,
  kp_number,
  biochar_producer_id,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code
  ),
  ${KONTIKKI_OPERATORS_SELECT},
  top_diameter_cm,
  bottom_diameter_cm,
  depth_cm,
  capacity,
  top_photo_urls,
  bottom_photo_urls,
  top_photo_url,
  side_photo_url,
  plan_pdf_url
`;

@Injectable()
export class KontikkisService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Not allowed to manage kontikkis');
    }
  }

  async findAll(
    user: AuthenticatedUser,
    biocharProducerId?: string,
    operatorId?: string,
  ): Promise<KontikkiRecord[]> {
    this.assertCanManage(user);

    let query = this.supabase
      .from('kontikkis')
      .select(KONTIKKI_LIST_SELECT)
      .order('created_at', { ascending: false });

    if (biocharProducerId) {
      query = query.eq('biochar_producer_id', biocharProducerId);
    }

    if (operatorId) {
      const { data: links, error: linkError } = await this.supabase
        .from('kontikki_operators')
        .select('kontikki_id')
        .eq('operator_id', operatorId);

      if (linkError) {
        throw new BadRequestException(linkError.message);
      }

      const kontikkiIds = (links ?? []).map((link) => link.kontikki_id);
      if (kontikkiIds.length === 0) {
        return [];
      }

      query = query.in('id', kontikkiIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []) as unknown as KontikkiRecord[];
  }

  async findById(user: AuthenticatedUser, id: string): Promise<KontikkiRecord> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('kontikkis')
      .select(KONTIKKI_DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Kontikki not found');
    }

    return data as unknown as KontikkiRecord;
  }

  async create(
    user: AuthenticatedUser,
    payload: CreateKontikkiPayload,
  ): Promise<KontikkiRecord> {
    this.assertCanManage(user);
    this.validateCoreFields(payload);

    const {
      operator_ids = [],
      top_photo_urls,
      bottom_photo_urls,
      plan_pdf_url,
      ...row
    } = payload;

    const { data, error } = await this.supabase
      .from('kontikkis')
      .insert({
        ...row,
        module_id: this.normalizeModuleId(row.module_id),
        kp_number: null,
        top_photo_url: null,
        side_photo_url: null,
        plan_pdf_url: plan_pdf_url ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.syncOperators(data.id, operator_ids);

    if (top_photo_urls !== undefined || bottom_photo_urls !== undefined) {
      await this.updatePhotoFields(
        data.id,
        top_photo_urls ?? [],
        bottom_photo_urls ?? [],
      );
    }

    if (plan_pdf_url) {
      const { error: planError } = await this.supabase
        .from('kontikkis')
        .update({ plan_pdf_url })
        .eq('id', data.id);

      if (planError) {
        throw new BadRequestException(planError.message);
      }
    }

    return this.findById(user, data.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: UpdateKontikkiPayload,
  ): Promise<KontikkiRecord> {
    this.assertCanManage(user);
    await this.ensureKontikkiExists(id);

    const {
      operator_ids,
      top_photo_urls,
      bottom_photo_urls,
      ...row
    } = payload;

    if (Object.keys(row).length > 0) {
      const updateRow = { ...row };
      if ('module_id' in updateRow) {
        updateRow.module_id = this.normalizeModuleId(updateRow.module_id);
      }

      const { error } = await this.supabase
        .from('kontikkis')
        .update(updateRow)
        .eq('id', id);

      if (error) {
        throw new BadRequestException(error.message);
      }
    }

    if (operator_ids !== undefined) {
      await this.syncOperators(id, operator_ids);
    }

    if (top_photo_urls !== undefined || bottom_photo_urls !== undefined) {
      await this.updatePhotoFields(
        id,
        top_photo_urls ?? [],
        bottom_photo_urls ?? [],
      );
    }

    return this.findById(user, id);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);
    await this.ensureKontikkiExists(id);

    const { error: rpcError } = await this.supabase.rpc('delete_kontikki', {
      kontikki_id: id,
    });

    if (!rpcError) {
      return;
    }

    const { error: operatorDeleteError } = await this.supabase
      .from('kontikki_operators')
      .delete()
      .eq('kontikki_id', id);

    if (operatorDeleteError) {
      throw new BadRequestException(operatorDeleteError.message);
    }

    const { error: deleteError } = await this.supabase
      .from('kontikkis')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }
  }

  private validateCoreFields(payload: CreateKontikkiPayload): void {
    if (!payload.kontikki_code?.trim()) {
      throw new BadRequestException('Kontikki code is required.');
    }
    if (payload.module_id !== undefined && payload.module_id !== null) {
      const normalized = this.normalizeModuleId(payload.module_id);
      if (normalized && normalized.length > 128) {
        throw new BadRequestException('Module ID must be 128 characters or fewer.');
      }
    }
    if (!payload.biochar_producer_id) {
      throw new BadRequestException('Producer is required.');
    }
    if (!payload.top_diameter_cm || !payload.bottom_diameter_cm || !payload.depth_cm) {
      throw new BadRequestException('Dimensions are required.');
    }
  }

  private normalizeModuleId(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async ensureKontikkiExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('kontikkis')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Kontikki not found');
    }
  }

  private async syncOperators(
    kontikkiId: string,
    operatorIds: string[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from('kontikki_operators')
      .delete()
      .eq('kontikki_id', kontikkiId);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    if (operatorIds.length === 0) {
      return;
    }

    const { error: insertError } = await this.supabase
      .from('kontikki_operators')
      .insert(
        operatorIds.map((operator_id) => ({
          kontikki_id: kontikkiId,
          operator_id,
        })),
      );

    if (insertError) {
      throw new BadRequestException(insertError.message);
    }
  }

  private async updatePhotoFields(
    kontikkiId: string,
    topPhotoUrls: string[],
    bottomPhotoUrls: string[],
  ): Promise<void> {
    const legacyPayload = {
      top_photo_url: topPhotoUrls[0] ?? null,
      side_photo_url: bottomPhotoUrls[0] ?? null,
    };

    const fullPayload = {
      ...legacyPayload,
      top_photo_urls: topPhotoUrls,
      bottom_photo_urls: bottomPhotoUrls,
    };

    const { error } = await this.supabase
      .from('kontikkis')
      .update(fullPayload)
      .eq('id', kontikkiId);

    if (!error) {
      return;
    }

    const message = error.message ?? '';
    if (
      message.includes('top_photo_urls') ||
      message.includes('bottom_photo_urls') ||
      message.includes('schema cache')
    ) {
      const { error: legacyError } = await this.supabase
        .from('kontikkis')
        .update(legacyPayload)
        .eq('id', kontikkiId);

      if (legacyError) {
        throw new BadRequestException(legacyError.message);
      }
      return;
    }

    throw new BadRequestException(error.message);
  }
}
