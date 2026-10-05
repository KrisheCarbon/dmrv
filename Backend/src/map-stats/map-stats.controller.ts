import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { MapStatsService } from './map-stats.service';

@Controller('map-stats')
@UseGuards(SupabaseAuthGuard)
export class MapStatsController {
  constructor(private readonly mapStatsService: MapStatsService) {}

  @Get('farmers')
  farmers(@AuthUser() user: AuthenticatedUser) {
    return this.mapStatsService.farmerStats(user);
  }
}
