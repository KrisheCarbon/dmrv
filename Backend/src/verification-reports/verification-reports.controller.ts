import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  RainbowRecordsService,
  type EmissionPayload,
  type LabPayload,
  type MethanePayload,
  type PollutantPayload,
  type SoilPayload,
} from './rainbow-records.service';
import { VerificationReportsService } from './verification-reports.service';

@Controller('verification-reports')
@UseGuards(SupabaseAuthGuard)
export class VerificationReportsController {
  constructor(
    private readonly verificationReportsService: VerificationReportsService,
    private readonly rainbowRecordsService: RainbowRecordsService,
  ) {}

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

  @Get('rainbow/inputs')
  rainbowInputs(@AuthUser() user: AuthenticatedUser) {
    return this.rainbowRecordsService.inputs(user);
  }

  @Get('rainbow')
  async downloadRainbow(
    @AuthUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pack = await this.rainbowRecordsService.buildPackage(user);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pack.filename}"`);
    res.setHeader('Content-Length', pack.buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(pack.buffer);
  }

  @Post('rainbow/lab-samples')
  saveLabSample(@AuthUser() user: AuthenticatedUser, @Body() body: LabPayload) {
    return this.rainbowRecordsService.saveLabSample(user, body);
  }

  @Post('rainbow/pollutants')
  savePollutant(@AuthUser() user: AuthenticatedUser, @Body() body: PollutantPayload) {
    return this.rainbowRecordsService.savePollutantTest(user, body);
  }

  @Post('rainbow/methane')
  saveMethane(@AuthUser() user: AuthenticatedUser, @Body() body: MethanePayload) {
    return this.rainbowRecordsService.saveMethane(user, body);
  }

  @Delete('rainbow/methane/:id')
  @HttpCode(204)
  deleteMethane(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rainbowRecordsService.deleteMethane(user, id);
  }

  @Post('rainbow/emissions')
  saveEmissions(@AuthUser() user: AuthenticatedUser, @Body() body: EmissionPayload) {
    return this.rainbowRecordsService.saveEmissions(user, body);
  }

  @Post('rainbow/soil-temperature')
  saveSoil(@AuthUser() user: AuthenticatedUser, @Body() body: SoilPayload) {
    return this.rainbowRecordsService.saveSoilTemperature(user, body);
  }
}
