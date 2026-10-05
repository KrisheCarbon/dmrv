import { Controller, Get, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { VerificationReportsService } from './verification-reports.service';

@Controller('verification-reports')
@UseGuards(SupabaseAuthGuard)
export class VerificationReportsController {
  constructor(private readonly verificationReportsService: VerificationReportsService) {}

  @Get('csi')
  async downloadCsi(
    @AuthUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pack = await this.verificationReportsService.buildCsiZip(user);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pack.filename}"`);
    res.setHeader('Content-Length', pack.buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(pack.buffer);
  }
}
