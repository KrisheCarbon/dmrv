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

export type ProducerSiteModel = 'hub' | 'mobile' | 'both';
export type BiocharProducerClass = 'artisan_pro' | 'csink' | 'not_registered';
export type BiocharProducerStatus = 'active' | 'inactive';

export interface AffiliationPayload {
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
}

export interface LocationPayload {
  lat: number;
  lng: number;
  place_name?: string | null;
  address?: string | null;
  source?: string;
}

export interface ProducerSitePayload extends AffiliationPayload {
  site_name: string;
  site_location: LocationPayload;
  site_manager_name: string;
  site_manager_email: string;
  site_manager_mobile: string;
}

export interface CreateProducerPayload {
  registry_producer_id?: string | null;
  name: string;
  producer_class?: BiocharProducerClass;
  status?: BiocharProducerStatus;
  producer_location: LocationPayload;
  contact_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  operation_model: ProducerSiteModel;
  partner_organization_id?: string | null;
  is_individual_contributor?: boolean;
  is_from_krishe?: boolean;
  contract_url?: string | null;
  training_cert_url?: string | null;
  other_document_url?: string | null;
  other_document_urls?: string[] | null;
  sites?: ProducerSitePayload[];
  supervisor_ids?: string[];
}

export interface UpdateProducerPayload extends Partial<CreateProducerPayload> {
  contract_url?: string | null;
  training_cert_url?: string | null;
  other_document_url?: string | null;
  other_document_urls?: string[] | null;
}

const PRODUCER_SELECT = `
  *,
  partner_organizations (
    id,
    org_name
  ),
  producer_sites (
    id,
    site_name,
    site_model,
    site_location,
    partner_organization_id,
    is_individual_contributor,
    is_from_krishe,
    site_manager_name,
    site_manager_email,
    site_manager_mobile,
    partner_organizations (
      id,
      org_name
    )
  ),
  kontikkis (
    id,
    kontikki_code,
    status,
    kontikki_operators (
      operator_id,
      users (
        id,
        full_name
      )
    )
  )
`;

@Injectable()
export class BiocharProducersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canManageProducers(user.role)) {
      throw new ForbiddenException('Not allowed to manage biochar producers');
    }
  }

  private affiliationToDb(fields: AffiliationPayload) {
    const isIndividual = Boolean(fields.is_individual_contributor);
    const isKrishe = Boolean(fields.is_from_krishe);
    return {
      partner_organization_id:
        isIndividual || isKrishe ? null : fields.partner_organization_id ?? null,
      is_individual_contributor: isIndividual,
      is_from_krishe: isKrishe,
    };
  }

  private generateProducerCode(): string {
    return `BP-${Date.now().toString(36).toUpperCase()}`;
  }

  async findAll(user: AuthenticatedUser) {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select(
        `
        id,
        producer_code,
        registry_producer_id,
        name,
        producer_class,
        status,
        contact_name,
        mobile_number,
        operation_model,
        producer_sites ( id )
      `,
      )
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async findById(user: AuthenticatedUser, id: string) {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select(PRODUCER_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Producer not found');
    return this.attachSupervisors(data, id);
  }

  private async attachSupervisors<
    T extends Record<string, unknown>,
  >(producer: T, producerId: string): Promise<T> {
    const { data: links, error } = await this.supabase
      .from('biochar_producer_supervisors')
      .select('supervisor_id')
      .eq('biochar_producer_id', producerId);

    if (error) throw new BadRequestException(error.message);

    if (!links?.length) {
      return { ...producer, biochar_producer_supervisors: [] };
    }

    const supervisorIds = links.map((row) => row.supervisor_id as string);
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, full_name, email, phone')
      .in('id', supervisorIds);

    if (usersError) throw new BadRequestException(usersError.message);

    const usersById = new Map(
      (users ?? []).map((row) => [row.id as string, row]),
    );

    return {
      ...producer,
      biochar_producer_supervisors: links.map((row) => ({
        supervisor_id: row.supervisor_id,
        users: usersById.get(row.supervisor_id as string) ?? null,
      })),
    };
  }

  async create(user: AuthenticatedUser, payload: CreateProducerPayload) {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('biochar_producers')
      .insert({
        producer_code: this.generateProducerCode(),
        registry_producer_id: payload.registry_producer_id?.trim() || null,
        name: payload.name.trim(),
        producer_class: payload.producer_class ?? 'artisan_pro',
        status: payload.status ?? 'active',
        producer_location: payload.producer_location,
        contact_name: payload.contact_name?.trim() || null,
        email: payload.email?.trim() || null,
        mobile_number: payload.mobile_number?.trim() || null,
        operation_model: payload.operation_model,
        contract_url: payload.contract_url ?? null,
        training_cert_url: payload.training_cert_url ?? null,
        other_document_url: payload.other_document_url ?? null,
        other_document_urls: payload.other_document_urls ?? [],
        ...this.affiliationToDb(payload),
      })
      .select('id')
      .single();

    if (error) throw new BadRequestException(error.message);

    const id = data.id as string;

    try {
      if (payload.sites?.length) {
        await this.insertSites(id, payload.operation_model, payload.sites);
      }

      if (payload.supervisor_ids !== undefined) {
        await this.syncSupervisorRows(id, payload.supervisor_ids);
      }

      return this.findById(user, id);
    } catch (err) {
      await this.supabase.from('biochar_producers').delete().eq('id', id);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Failed to create producer',
      );
    }
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: UpdateProducerPayload,
  ) {
    this.assertCanManage(user);
    await this.ensureProducerExists(id);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.registry_producer_id !== undefined) {
      updates.registry_producer_id =
        payload.registry_producer_id?.trim() || null;
    }
    if (payload.name !== undefined) updates.name = payload.name.trim();
    if (payload.producer_class !== undefined) {
      updates.producer_class = payload.producer_class;
    }
    if (payload.status !== undefined) {
      updates.status = payload.status;
    }
    if (payload.producer_location !== undefined) {
      updates.producer_location = payload.producer_location;
    }
    if (payload.contact_name !== undefined) {
      updates.contact_name = payload.contact_name?.trim() || null;
    }
    if (payload.email !== undefined) {
      updates.email = payload.email?.trim() || null;
    }
    if (payload.mobile_number !== undefined) {
      updates.mobile_number = payload.mobile_number?.trim() || null;
    }
    if (payload.operation_model !== undefined) {
      updates.operation_model = payload.operation_model;
    }
    if (
      payload.partner_organization_id !== undefined ||
      payload.is_individual_contributor !== undefined ||
      payload.is_from_krishe !== undefined
    ) {
      Object.assign(updates, this.affiliationToDb(payload));
    }
    if (payload.contract_url !== undefined) {
      updates.contract_url = payload.contract_url;
    }
    if (payload.training_cert_url !== undefined) {
      updates.training_cert_url = payload.training_cert_url;
    }
    if (payload.other_document_url !== undefined) {
      updates.other_document_url = payload.other_document_url;
    }
    if (payload.other_document_urls !== undefined) {
      updates.other_document_urls = payload.other_document_urls;
    }

    const { error } = await this.supabase
      .from('biochar_producers')
      .update(updates)
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);

    if (payload.sites !== undefined) {
      const operationModel =
        payload.operation_model ??
        (await this.getOperationModel(id));
      await this.replaceSites(id, operationModel, payload.sites);
    }

    if (payload.supervisor_ids !== undefined) {
      await this.syncSupervisorRows(id, payload.supervisor_ids);
    }

    return this.findById(user, id);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);

    const { error } = await this.supabase
      .from('biochar_producers')
      .delete()
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
  }

  private async getOperationModel(id: string): Promise<ProducerSiteModel> {
    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select('operation_model')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data?.operation_model) {
      throw new BadRequestException('Producer operation model is missing.');
    }

    return data.operation_model as ProducerSiteModel;
  }

  private async insertSites(
    producerId: string,
    operationModel: ProducerSiteModel,
    sites: ProducerSitePayload[],
  ): Promise<void> {
    if (!sites.length) return;

    const rows = sites.map((site) => ({
      biochar_producer_id: producerId,
      site_name: site.site_name.trim(),
      site_model: operationModel,
      site_location: site.site_location,
      site_manager_name: site.site_manager_name.trim(),
      site_manager_email: site.site_manager_email.trim(),
      site_manager_mobile: site.site_manager_mobile.trim(),
      ...this.affiliationToDb(site),
    }));

    const { error } = await this.supabase.from('producer_sites').insert(rows);
    if (error) throw new BadRequestException(error.message);
  }

  private async replaceSites(
    producerId: string,
    operationModel: ProducerSiteModel,
    sites: ProducerSitePayload[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from('producer_sites')
      .delete()
      .eq('biochar_producer_id', producerId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    await this.insertSites(producerId, operationModel, sites);
  }

  private async syncSupervisorRows(
    producerId: string,
    supervisorIds: string[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from('biochar_producer_supervisors')
      .delete()
      .eq('biochar_producer_id', producerId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    if (supervisorIds.length > 0) {
      const { error: insertError } = await this.supabase
        .from('biochar_producer_supervisors')
        .insert(
          supervisorIds.map((supervisor_id) => ({
            biochar_producer_id: producerId,
            supervisor_id,
          })),
        );

      if (insertError) throw new BadRequestException(insertError.message);
    }
  }

  private async ensureProducerExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Producer not found');
  }
}
