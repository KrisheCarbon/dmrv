import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessNetwork, canAccessWebPortal } from '@krishecarbon/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import {
  TRAINING_BUCKET,
  assertFiles,
  docTypes,
  photoTypes,
  videoTypes,
  type StoredFileInput,
  type StoredFileRecord,
} from './field-operations.files';

export interface TrainingSessionRecord {
  id: string;
  held_at: string;
  trainer_name: string;
  latitude: number;
  longitude: number;
  location_label: string | null;
  created_at: string;
  producers: { id: string; name: string }[];
  files: StoredFileRecord[];
}

interface CreateTrainingSessionBody {
  held_at?: unknown;
  trainer_name?: unknown;
  producer_ids?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  location_label?: unknown;
  files?: StoredFileInput[];
}

@Injectable()
export class TrainingSessionsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async list(user: AuthenticatedUser): Promise<TrainingSessionRecord[]> {
    this.assertView(user);
    const { data, error } = await this.supabase
      .from('training_sessions')
      .select(
        `id, held_at, trainer_name, latitude, longitude, location_label, created_at,
         training_session_producers(producer_id, biochar_producers(id, name)),
         training_session_files(id, kind, bucket, path, file_name, content_type)`,
      )
      .order('held_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    const rows = await Promise.all(
      (data ?? []).map((row) => this.shape(row as Record<string, unknown>)),
    );
    return rows;
  }

  async options(user: AuthenticatedUser) {
    this.assertView(user);
    return { producers: await this.producers() };
  }

  async create(user: AuthenticatedUser, body: CreateTrainingSessionBody) {
    this.assertManage(user);
    const heldAt = parseHeldAt(body.held_at);
    const trainerName = requiredName(body.trainer_name, 'Enter the trainer’s name.');
    const producerIds = uniqueIds(body.producer_ids);
    if (producerIds.length === 0) {
      throw new BadRequestException('Select at least one producer.');
    }
    const point = parsePoint(body.latitude, body.longitude);
    const locationLabel = optionalLabel(body.location_label);
    const files = assertFiles({
      files: Array.isArray(body.files) ? body.files : [],
      userId: user.id,
      bucket: TRAINING_BUCKET,
      allowed: {
        attendance: docTypes(),
        material: docTypes(),
        photo: photoTypes(),
        video: videoTypes(),
      },
      required: ['attendance', 'photo'],
    });
    await this.assertProducersExist(producerIds);

    const { data, error } = await this.supabase
      .from('training_sessions')
      .insert({
        held_at: heldAt,
        trainer_name: trainerName,
        latitude: point.latitude,
        longitude: point.longitude,
        location_label: locationLabel,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not save the training.');
    }
    const id = data.id as string;

    const { error: linkError } = await this.supabase.from('training_session_producers').insert(
      producerIds.map((producerId) => ({ training_id: id, producer_id: producerId })),
    );
    if (linkError) {
      await this.supabase.from('training_sessions').delete().eq('id', id);
      throw new BadRequestException(linkError.message);
    }

    const { error: fileError } = await this.supabase.from('training_session_files').insert(
      files.map((file) => ({
        training_id: id,
        kind: file.kind,
        bucket: TRAINING_BUCKET,
        path: file.path,
        file_name: file.file_name,
        content_type: file.content_type,
      })),
    );
    if (fileError) {
      await this.supabase.from('training_sessions').delete().eq('id', id);
      throw new BadRequestException(fileError.message);
    }

    const saved = await this.list(user);
    const match = saved.find((row) => row.id === id);
    if (!match) throw new NotFoundException('Training was saved but could not be read back.');
    return match;
  }

  private async shape(row: Record<string, unknown>): Promise<TrainingSessionRecord> {
    const links = asArray(row.training_session_producers);
    const producers = links
      .map((link) => {
        const producer = first(link.biochar_producers);
        const id = (producer?.id as string) || (link.producer_id as string);
        const name = ((producer?.name as string) || '').trim() || 'Producer';
        return id ? { id, name } : null;
      })
      .filter((item): item is { id: string; name: string } => Boolean(item));
    const files = await this.sign(
      asArray(row.training_session_files).map((file) => ({
        id: String(file.id),
        kind: String(file.kind),
        bucket: String(file.bucket),
        path: String(file.path),
        file_name: String(file.file_name),
        content_type: String(file.content_type),
        signed_url: null,
      })),
    );
    return {
      id: String(row.id),
      held_at: String(row.held_at),
      trainer_name: String(row.trainer_name),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      location_label: (row.location_label as string | null) ?? null,
      created_at: String(row.created_at),
      producers,
      files,
    };
  }

  private async sign(files: StoredFileRecord[]): Promise<StoredFileRecord[]> {
    return Promise.all(
      files.map(async (file) => {
        const { data } = await this.supabase.storage.from(file.bucket).createSignedUrl(file.path, 60 * 60);
        return { ...file, signed_url: data?.signedUrl ?? null };
      }),
    );
  }

  private async producers() {
    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: ((row.name as string | null) ?? '').trim() || 'Producer',
    }));
  }

  private async assertProducersExist(ids: string[]) {
    const { data, error } = await this.supabase.from('biochar_producers').select('id').in('id', ids);
    if (error) throw new BadRequestException(error.message);
    if ((data ?? []).length !== ids.length) {
      throw new BadRequestException('One of the selected producers was not found.');
    }
  }

  private assertView(user: AuthenticatedUser) {
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to view trainings.');
    }
  }

  private assertManage(user: AuthenticatedUser) {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Only admins and managers can add a training.');
    }
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

function first(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

export function parseHeldAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Enter the date and time.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Enter a valid date and time.');
  const latest = Date.now() + 24 * 60 * 60 * 1000;
  if (date.getTime() > latest) throw new BadRequestException('The date cannot be in the future.');
  if (date.getFullYear() < 2020) throw new BadRequestException('Enter a date from 2020 onward.');
  return date.toISOString();
}

export function requiredName(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(message);
  const name = value.trim();
  if (name.length > 120) throw new BadRequestException('That name is too long.');
  return name;
}

export function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function parsePoint(latitude: unknown, longitude: unknown) {
  const lat = typeof latitude === 'number' ? latitude : Number(latitude);
  const lng = typeof longitude === 'number' ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BadRequestException('Choose the location on the map.');
  }
  return { latitude: lat, longitude: lng };
}

export function optionalLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  if (!label) return null;
  return label.slice(0, 240);
}
