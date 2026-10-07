import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { FieldActivityService } from './field-activity.service';

@Controller('mobile-stats')
@UseGuards(SupabaseAuthGuard)
export class FieldActivityController {
  constructor(private readonly fieldActivity: FieldActivityService) {}

  @Get('field-activity')
  fieldActivityStats(
    @AuthUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clusterId') clusterId?: string,
    @Query('scope') scope?: string,
    @Query('userId') userId?: string,
  ) {
    return this.fieldActivity.getStats(user, { from, to, clusterId, scope, userId });
  }
}
