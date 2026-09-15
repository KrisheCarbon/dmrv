import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessNetwork, canAccessWebPortal } from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface TrainingSupervisorOption {
  id: string;
  full_name: string;
}

export interface TrainingLocationOption {
  type: 'producer' | 'site';
  id: string;
  label: string;
}

export interface TrainingFormOptions {
  supervisors: TrainingSupervisorOption[];
  locations: TrainingLocationOption[];
}

export interface TrainingRecord {
  id: string;
  supervisor_id: string;
  biochar_producer_id?: string | null;
  producer_site_id?: string | null;
  certificate_url: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  supervisor?: {
    id: string;
    full_name?: string | null;
  } | null;
  biochar_producer?: {
    id: string;
    name?: string | null;
  } | null;
  producer_site?: {
    id: string;
    site_name?: string | null;
  } | null;
}

export interface CreateTrainingPayload {
  id?: string;
  supervisor_id: string;
  location_type: 'producer' | 'site';
  location_id: string;
  certificate_url: string;
}

export interface UpdateTrainingPayload {
  supervisor_id?: string;
  location_type?: 'producer' | 'site';
  location_id?: string;
  certificate_url?: string;
}

const TRAINING_SELECT = `
  id,
  supervisor_id,
  biochar_producer_id,
  producer_site_id,
  certificate_url,
  created_by,
  created_at,
  updated_at,
  supervisor:users!training_records_supervisor_id_fkey (
    id,
    full_name
  ),
  biochar_producer:biochar_producers (
    id,
    name
  ),
  producer_site:producer_sites (
    id,
    site_name
  )
`;

@Injectable()
export class TrainingsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private normalizeTrainingRecord(row: Record<string, unknown>): TrainingRecord {
    const supervisor = row.supervisor;
    const biocharProducer = row.biochar_producer;
    const producerSite = row.producer_site;
    const base = row as unknown as TrainingRecord;

    return {
      ...base,
      supervisor: Array.isArray(supervisor)
        ? ((supervisor[0] as TrainingRecord['supervisor']) ?? null)
        : ((supervisor as TrainingRecord['supervisor']) ?? null),
      biochar_producer: Array.isArray(biocharProducer)
        ? ((biocharProducer[0] as TrainingRecord['biochar_producer']) ?? null)
        : ((biocharProducer as TrainingRecord['biochar_producer']) ?? null),
      producer_site: Array.isArray(producerSite)
        ? ((producerSite[0] as TrainingRecord['producer_site']) ?? null)
        : ((producerSite as TrainingRecord['producer_site']) ?? null),
    };
  }

  private assertCanView(user: AuthenticatedUser): void {
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to view trainings');
    }
  }

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Only admins and managers can manage trainings');
    }
  }

  async findAll(user: AuthenticatedUser): Promise<TrainingRecord[]> {
    this.assertCanView(user);

    const { data, error } = await this.supabase
      .from('training_records')
      .select(TRAINING_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((row) =>
      this.normalizeTrainingRecord(row as Record<string, unknown>),
    );
  }

  async findById(user: AuthenticatedUser, id: string): Promise<TrainingRecord> {
    this.assertCanView(user);

    const { data, error } = await this.supabase
      .from('training_records')
      .select(TRAINING_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Training record not found');
    }

    return this.normalizeTrainingRecord(data as Record<string, unknown>);
  }

  async getFormOptions(user: AuthenticatedUser): Promise<TrainingFormOptions> {
    this.assertCanView(user);

    const [supervisorsResult, producersResult, sitesResult] = await Promise.all([
      this.supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'supervisor')
        .order('full_name', { ascending: true }),
      this.supabase
        .from('biochar_producers')
        .select('id, name')
        .order('name', { ascending: true }),
      this.supabase
        .from('producer_sites')
        .select('id, site_name, biochar_producer_id, biochar_producers(name)')
        .order('site_name', { ascending: true }),
    ]);

    if (supervisorsResult.error) {
      throw new BadRequestException(supervisorsResult.error.message);
    }
    if (producersResult.error) {
      throw new BadRequestException(producersResult.error.message);
    }
    if (sitesResult.error) {
      throw new BadRequestException(sitesResult.error.message);
    }

    const supervisors: TrainingSupervisorOption[] = (supervisorsResult.data ?? []).map(
      (row) => ({
        id: row.id as string,
        full_name: (row.full_name as string | null)?.trim() || 'Unnamed supervisor',
      }),
    );

    const locations: TrainingLocationOption[] = [];

    for (const producer of producersResult.data ?? []) {
      locations.push({
        type: 'producer',
        id: producer.id as string,
        label: (producer.name as string | null)?.trim() || 'Unnamed producer',
      });
    }

    for (const site of sitesResult.data ?? []) {
      const producer = Array.isArray(site.biochar_producers)
        ? site.biochar_producers[0]
        : site.biochar_producers;
      const producerName =
        (producer?.name as string | null)?.trim() || 'Producer';
      const siteName =
        (site.site_name as string | null)?.trim() || 'Unnamed site';

      locations.push({
        type: 'site',
        id: site.id as string,
        label: `${siteName} (${producerName})`,
      });
    }

    locations.sort((a, b) => a.label.localeCompare(b.label));

    return { supervisors, locations };
  }

  async create(
    user: AuthenticatedUser,
    payload: CreateTrainingPayload,
  ): Promise<TrainingRecord> {
    this.assertCanManage(user);
    this.validatePayload(payload);

    const location = this.resolveLocation(payload.location_type, payload.location_id);

    const insertRow: Record<string, string | null> = {
      supervisor_id: payload.supervisor_id.trim(),
      biochar_producer_id: location.biochar_producer_id,
      producer_site_id: location.producer_site_id,
      certificate_url: payload.certificate_url.trim(),
      created_by: user.id,
    };

    if (payload.id?.trim()) {
      insertRow.id = payload.id.trim();
    }

    const { data, error } = await this.supabase
      .from('training_records')
      .insert(insertRow)
      .select(TRAINING_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeTrainingRecord(data as Record<string, unknown>);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    payload: UpdateTrainingPayload,
  ): Promise<TrainingRecord> {
    this.assertCanManage(user);
    await this.ensureExists(id);

    const updates: Record<string, string | null> = {};

    if (payload.supervisor_id !== undefined) {
      if (!payload.supervisor_id.trim()) {
        throw new BadRequestException('Supervisor is required.');
      }
      updates.supervisor_id = payload.supervisor_id.trim();
    }

    if (payload.location_type !== undefined && payload.location_id !== undefined) {
      const location = this.resolveLocation(
        payload.location_type,
        payload.location_id,
      );
      updates.biochar_producer_id = location.biochar_producer_id;
      updates.producer_site_id = location.producer_site_id;
    }

    if (payload.certificate_url !== undefined) {
      if (!payload.certificate_url.trim()) {
        throw new BadRequestException('Training certificate PDF is required.');
      }
      updates.certificate_url = payload.certificate_url.trim();
    }

    if (Object.keys(updates).length === 0) {
      return this.findById(user, id);
    }

    const { data, error } = await this.supabase
      .from('training_records')
      .update(updates)
      .eq('id', id)
      .select(TRAINING_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeTrainingRecord(data as Record<string, unknown>);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertCanManage(user);
    await this.ensureExists(id);

    const { error } = await this.supabase
      .from('training_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private resolveLocation(
    locationType: 'producer' | 'site',
    locationId: string,
  ): {
    biochar_producer_id: string | null;
    producer_site_id: string | null;
  } {
    const id = locationId.trim();
    if (!id) {
      throw new BadRequestException('Training location is required.');
    }

    if (locationType === 'producer') {
      return {
        biochar_producer_id: id,
        producer_site_id: null,
      };
    }

    return {
      biochar_producer_id: null,
      producer_site_id: id,
    };
  }

  private validatePayload(payload: CreateTrainingPayload): void {
    if (!payload.supervisor_id?.trim()) {
      throw new BadRequestException('Supervisor is required.');
    }
    if (!payload.certificate_url?.trim()) {
      throw new BadRequestException('Training certificate PDF is required.');
    }
    if (!payload.location_type || !payload.location_id?.trim()) {
      throw new BadRequestException('Training location is required.');
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('training_records')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Training record not found');
    }
  }
}
