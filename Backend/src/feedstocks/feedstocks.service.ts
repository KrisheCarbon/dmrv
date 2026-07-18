import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canManageProducers } from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export type FeedstockLabStatus =
  | 'estimated'
  | 'waiting_for_results'
  | 'analysis_completed'
  | 'superseded';

export type MethaneCompensationStrategy =
  | 'offsetting_from_scp_fraction'
  | 'csi_approved_avoidance_of_ghg';

export interface FeedstockRecord {
  id: string;
  biomass_type: string;
  biochar_producer_id: string;
  biochar_bulk_density_kg_m3: number;
  carbon_content_percent: number;
  hc_ratio: number;
  lab_status: FeedstockLabStatus;
  lab_submission_date: string;
  lab_analysis_date: string;
  biomass_preparation_instruction?: string | null;
  methane_compensation_strategy: MethaneCompensationStrategy;
  lab_report_doc_url?: string | null;
  lab_report_image_url?: string | null;
  ghg_avoidance_approval_doc_url?: string | null;
  ghg_avoidance_approval_image_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  biochar_producer?:
    | {
        id: string;
        name?: string;
        producer_code?: string | null;
      }
    | {
        id: string;
        name?: string;
        producer_code?: string | null;
      }[]
    | null;
}

export interface CreateFeedstockPayload {
  biomass_type: string;
  biochar_producer_id: string;
  biochar_bulk_density_kg_m3: number;
  carbon_content_percent: number;
  hc_ratio: number;
  lab_status: FeedstockLabStatus;
  lab_submission_date: string;
  lab_analysis_date: string;
  biomass_preparation_instruction?: string | null;
  methane_compensation_strategy: MethaneCompensationStrategy;
  lab_report_doc_url?: string | null;
  lab_report_image_url?: string | null;
  ghg_avoidance_approval_doc_url?: string | null;
  ghg_avoidance_approval_image_url?: string | null;
}

export interface UpdateFeedstockPayload extends Partial<CreateFeedstockPayload> {}

const FEEDSTOCK_LIST_SELECT = `
  id,
  biomass_type,
  biochar_producer_id,
  biochar_bulk_density_kg_m3,
  carbon_content_percent,
  hc_ratio,
  lab_status,
  lab_submission_date,
  lab_analysis_date,
  methane_compensation_strategy,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code
  )
`;

const FEEDSTOCK_DETAIL_SELECT = `
  *,
  biochar_producer:biochar_producers (
    id,
    name,
    producer_code
  )
`;

@Injectable()
export class FeedstocksService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canManageProducers(user.role)) {
      throw new ForbiddenException('Not allowed to manage feedstock records');
    }
  }

  async findAll(user: AuthenticatedUser): Promise<FeedstockRecord[]> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('feedstocks')
      .select(FEEDSTOCK_LIST_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []) as unknown as FeedstockRecord[];
  }

  async findById(user: AuthenticatedUser, id: string): Promise<FeedstockRecord> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('feedstocks')
      .select(FEEDSTOCK_DETAIL_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Feedstock record not found');
    }

    return data as unknown as FeedstockRecord;
  }

  async create(
    user: AuthenticatedUser,
    payload: CreateFeedstockPayload,
  ): Promise<FeedstockRecord> {
    this.assertCanManage(user);
    this.validatePayload(payload);

    const { data, error } = await this.supabase
      .from('feedstocks')
      .insert({
        ...payload,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.findById(user, data.id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: UpdateFeedstockPayload,
  ): Promise<FeedstockRecord> {
    this.assertCanManage(user);
    const existing = await this.findById(user, id);

    if (Object.keys(payload).length > 0) {
      this.validatePayload(payload, true);
      this.assertLabReportPresent(existing, payload);
    }

    const { error } = await this.supabase
      .from('feedstocks')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.findById(user, id);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);
    await this.ensureFeedstockExists(id);

    const { error } = await this.supabase
      .from('feedstocks')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private validatePayload(
    payload: CreateFeedstockPayload | UpdateFeedstockPayload,
    partial = false,
  ): void {
    if (!partial || payload.biomass_type !== undefined) {
      if (!payload.biomass_type?.trim()) {
        throw new BadRequestException('Biomass type is required.');
      }
    }

    if (!partial || payload.biochar_producer_id !== undefined) {
      if (!payload.biochar_producer_id) {
        throw new BadRequestException('Producer is required.');
      }
    }

    if (
      payload.biochar_bulk_density_kg_m3 !== undefined &&
      (payload.biochar_bulk_density_kg_m3 < 100 ||
        payload.biochar_bulk_density_kg_m3 > 700)
    ) {
      throw new BadRequestException(
        'Biochar bulk density must be between 100 and 700 kg/m³.',
      );
    }

    if (
      payload.carbon_content_percent !== undefined &&
      (payload.carbon_content_percent <= 0 ||
        payload.carbon_content_percent > 100)
    ) {
      throw new BadRequestException(
        'Carbon content must be between 0 and 100%.',
      );
    }

    if (payload.hc_ratio !== undefined && payload.hc_ratio >= 0.4) {
      throw new BadRequestException('H/C ratio must be less than 0.4.');
    }

    if (payload.lab_status !== undefined) {
      const allowed: FeedstockLabStatus[] = [
        'estimated',
        'waiting_for_results',
        'analysis_completed',
        'superseded',
      ];
      if (!allowed.includes(payload.lab_status)) {
        throw new BadRequestException('Invalid lab status.');
      }
    }

    if (payload.methane_compensation_strategy !== undefined) {
      const allowed: MethaneCompensationStrategy[] = [
        'offsetting_from_scp_fraction',
        'csi_approved_avoidance_of_ghg',
      ];
      if (!allowed.includes(payload.methane_compensation_strategy)) {
        throw new BadRequestException('Invalid methane compensation strategy.');
      }
    }

    if (!partial) {
      if (!payload.lab_submission_date) {
        throw new BadRequestException('Lab submission date is required.');
      }
      if (!payload.lab_analysis_date) {
        throw new BadRequestException('Lab analysis date is required.');
      }
    } else {
      if (
        payload.lab_submission_date !== undefined &&
        !payload.lab_submission_date
      ) {
        throw new BadRequestException('Lab submission date is required.');
      }
      if (
        payload.lab_analysis_date !== undefined &&
        !payload.lab_analysis_date
      ) {
        throw new BadRequestException('Lab analysis date is required.');
      }
    }
  }

  private assertLabReportPresent(
    existing: FeedstockRecord,
    payload: UpdateFeedstockPayload,
  ): void {
    const nextDocUrl =
      payload.lab_report_doc_url !== undefined
        ? payload.lab_report_doc_url
        : existing.lab_report_doc_url;
    const nextImageUrl =
      payload.lab_report_image_url !== undefined
        ? payload.lab_report_image_url
        : existing.lab_report_image_url;

    if (!nextDocUrl && !nextImageUrl) {
      throw new BadRequestException('Lab report is required.');
    }
  }

  private async ensureFeedstockExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('feedstocks')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Feedstock record not found');
    }
  }
}
