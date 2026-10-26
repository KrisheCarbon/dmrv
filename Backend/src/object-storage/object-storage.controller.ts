import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { ObjectStorageService } from './object-storage.service';

@Controller('storage')
@UseGuards(SupabaseAuthGuard)
export class ObjectStorageController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Get('sign')
  async sign(
    @Query('bucket') bucket = '',
    @Query('path') path = '',
    @Query('expires') expires?: string,
  ) {
    const seconds = Number(expires);
    const url = await this.storage.sign(bucket, path, Number.isFinite(seconds) ? seconds : 3600);
    return { url };
  }

  @Post('upload-url')
  async uploadUrl(@Body() body: { bucket?: string; path?: string; contentType?: string }) {
    const uploadUrl = await this.storage.uploadUrl(
      body.bucket ?? '',
      body.path ?? '',
      body.contentType ?? 'application/octet-stream',
    );
    return { uploadUrl };
  }

  @Post('delete')
  async remove(@Body() body: { bucket?: string; path?: string }) {
    await this.storage.remove(body.bucket ?? '', body.path ?? '');
    return { ok: true };
  }
}
