import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  KilnBatchesService,
  type SyncKilnBatchPayload,
} from './kiln-batches.service';

@Controller('kiln-batches')
@UseGuards(SupabaseAuthGuard)
export class KilnBatchesController {
  constructor(private readonly kilnBatchesService: KilnBatchesService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.kilnBatchesService.listBatches(user);
  }

  @Get(':id')
  getBatch(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.kilnBatchesService.getBatchWithReadings(user, id);
  }

  @Post('sync')
  sync(
    @AuthUser() user: AuthenticatedUser,
    @Body() payload: SyncKilnBatchPayload,
  ) {
    return this.kilnBatchesService.syncBatch(user, payload);
  }
}
