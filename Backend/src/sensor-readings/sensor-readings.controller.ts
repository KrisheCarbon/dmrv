import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SensorReadingsService } from './sensor-readings.service';

@Controller('sensor-readings')
@UseGuards(SupabaseAuthGuard)
export class SensorReadingsController {
  constructor(private readonly sensorReadings: SensorReadingsService) {}

  @Get()
  list() {
    return this.sensorReadings.listSensors();
  }

  @Get(':deviceId')
  readings(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsed = Number(limit);
    const parsedOffset = Number(offset);
    return this.sensorReadings.readings(
      deviceId,
      Number.isFinite(parsed) ? parsed : undefined,
      from,
      to,
      Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    );
  }
}
