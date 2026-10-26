import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SupabaseClient } from '@supabase/supabase-js';
import { isObjectStorageBucket, storageRefFromValue } from '@krishecarbon/shared';
import { SUPABASE_AUTH_CLIENT } from '../supabase/supabase.module';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly s3: S3Client;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SUPABASE_AUTH_CLIENT) private readonly supabaseFiles: SupabaseClient,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION')?.trim() || 'ap-south-1',
    });
  }

  onModuleInit(): void {
    if (this.prefix()) {
      this.logger.log('File storage uses AWS');
    } else {
      this.logger.log('File storage uses Supabase');
    }
  }

  async sign(bucketOrValue: string, pathOrValue?: string, expiresIn = 3600): Promise<string | null> {
    const ref = this.ref(bucketOrValue, pathOrValue);
    if (!ref) return null;
    const expires = Math.min(Math.max(expiresIn, 60), 60 * 60 * 12);

    if (!this.prefix()) {
      const { data, error } = await this.supabaseFiles.storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, expires);
      if (error) return null;
      return data?.signedUrl ?? null;
    }

    try {
      return await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.awsBucket(ref.bucket), Key: ref.path }),
        { expiresIn: expires },
      );
    } catch (error) {
      this.logger.warn(`Could not sign ${ref.bucket}/${ref.path}: ${this.message(error)}`);
      return null;
    }
  }

  async uploadUrl(bucket: string, path: string, contentType: string): Promise<string> {
    const ref = this.ref(bucket, path);
    if (!ref) throw new BadRequestException('That file location is not allowed.');
    const type = contentType.trim() || 'application/octet-stream';

    if (!this.prefix()) {
      throw new BadRequestException('AWS file storage is not configured.');
    }

    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.awsBucket(ref.bucket),
        Key: ref.path,
        ContentType: type,
      }),
      { expiresIn: 15 * 60 },
    );
  }

  async remove(bucket: string, path: string): Promise<void> {
    const ref = this.ref(bucket, path);
    if (!ref) return;

    if (!this.prefix()) {
      const { error } = await this.supabaseFiles.storage.from(ref.bucket).remove([ref.path]);
      if (error) throw new BadRequestException(error.message);
      return;
    }

    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.awsBucket(ref.bucket), Key: ref.path }),
    );
  }

  private prefix(): string {
    return this.config.get<string>('S3_BUCKET_PREFIX')?.trim() ?? '';
  }

  private awsBucket(bucket: string): string {
    return `${this.prefix()}${bucket}`;
  }

  private ref(bucketOrValue: string, pathOrValue?: string): { bucket: string; path: string } | null {
    const direct = pathOrValue
      ? storageRefFromValue(pathOrValue, bucketOrValue) ??
        storageRefFromValue(bucketOrValue, pathOrValue)
      : storageRefFromValue(bucketOrValue);
    if (!direct || !isObjectStorageBucket(direct.bucket)) return null;
    const path = direct.path.replace(/^\/+/, '');
    if (!path || path.length > 1024 || path.includes('..') || path.includes('\\')) return null;
    return { bucket: direct.bucket, path };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
