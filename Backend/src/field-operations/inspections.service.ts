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
import { ObjectStorageService } from '../object-storage/object-storage.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import {
  INSPECTION_BUCKET,
  assertFiles,
  docTypes,
  photoTypes,
  videoTypes,
  type StoredFileInput,
  type StoredFileRecord,
} from './field-operations.files';
import {
  parseHeldAt,
  requiredName,
} from './training-sessions.service';

export interface InspectionRecord {
  id: string;
  held_at: string;
  inspector_name: string;
  producer: { id: string; name: string };
  created_at: string;
  files: StoredFileRecord[];
}

@Injectable()
export class InspectionsService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly files: ObjectStorageService,
  ) {}

  async list(user: AuthenticatedUser): Promise<InspectionRecord[]> {
    this.assertView(user);
    const { data, error } = await this.supabase
      .from('site_inspections')
      .select(
        `id, held_at, inspector_name, producer_id, created_at,
         biochar_producers(id, name),
         site_inspection_files(id, kind, bucket, path, file_name, content_type)`,
      )
      .order('held_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return Promise.all((data ?? []).map((row) => this.shape(row as Record<string, unknown>)));
  }

  async options(user: AuthenticatedUser) {
    this.assertView(user);
    const { data, error } = await this.supabase
      .from('biochar_producers')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return {
      producers: (data ?? []).map((row) => ({
        id: row.id as string,
        name: ((row.name as string | null) ?? '').trim() || 'Producer',
      })),
    };
  }

  async create(
    user: AuthenticatedUser,
    body: {
      held_at?: unknown;
      inspector_name?: unknown;
      producer_id?: unknown;
      files?: StoredFileInput[];
    },
  ) {
    this.assertManage(user);
    const heldAt = parseHeldAt(body.held_at);
    const inspectorName = requiredName(body.inspector_name, 'Enter the inspector’s name.');
    const producerId = typeof body.producer_id === 'string' ? body.producer_id : '';
    if (!producerId) throw new BadRequestException('Select one producer.');
    const files = assertFiles({
      files: Array.isArray(body.files) ? body.files : [],
      userId: user.id,
      bucket: INSPECTION_BUCKET,
      allowed: {
        report: docTypes(),
        photo: photoTypes(),
        video: videoTypes(),
      },
      required: ['photo'],
      exactlyOne: ['report'],
    });

    const { data: producer, error: producerError } = await this.supabase
      .from('biochar_producers')
      .select('id')
      .eq('id', producerId)
      .maybeSingle();
    if (producerError) throw new BadRequestException(producerError.message);
    if (!producer) throw new BadRequestException('That producer was not found.');

    const { data, error } = await this.supabase
      .from('site_inspections')
      .insert({
        held_at: heldAt,
        producer_id: producerId,
        inspector_name: inspectorName,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Could not save the inspection.');
    }
    const id = data.id as string;
    const { error: fileError } = await this.supabase.from('site_inspection_files').insert(
      files.map((file) => ({
        inspection_id: id,
        kind: file.kind,
        bucket: INSPECTION_BUCKET,
        path: file.path,
        file_name: file.file_name,
        content_type: file.content_type,
      })),
    );
    if (fileError) {
      await this.supabase.from('site_inspections').delete().eq('id', id);
      throw new BadRequestException(fileError.message);
    }

    const saved = await this.list(user);
    const match = saved.find((row) => row.id === id);
    if (!match) throw new NotFoundException('Inspection was saved but could not be read back.');
    return match;
  }

  private async shape(row: Record<string, unknown>): Promise<InspectionRecord> {
    const producer = first(row.biochar_producers);
    const files = asArray(row.site_inspection_files);
    const signed = await Promise.all(
      files.map(async (file) => {
        const bucket = String(file.bucket);
        const path = String(file.path);
        const signedUrl = await this.files.sign(bucket, path, 60 * 60);
        return {
          id: String(file.id),
          kind: String(file.kind),
          bucket,
          path,
          file_name: String(file.file_name),
          content_type: String(file.content_type),
          signed_url: signedUrl,
        };
      }),
    );
    return {
      id: String(row.id),
      held_at: String(row.held_at),
      inspector_name: String(row.inspector_name),
      producer: {
        id: (producer?.id as string) || String(row.producer_id),
        name: ((producer?.name as string) || '').trim() || 'Producer',
      },
      created_at: String(row.created_at),
      files: signed,
    };
  }

  private assertView(user: AuthenticatedUser) {
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('Not allowed to view inspections.');
    }
  }

  private assertManage(user: AuthenticatedUser) {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Only admins and managers can add an inspection.');
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
