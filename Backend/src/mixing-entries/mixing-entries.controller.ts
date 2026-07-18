import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type {
  CreateMixingEntryPayload,
  SubmitMixingEntryStatusPayload,
} from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { MixingEntriesService } from './mixing-entries.service';

@Controller('mixing-entries')
@UseGuards(SupabaseAuthGuard)
export class MixingEntriesController {
  constructor(private readonly mixingEntriesService: MixingEntriesService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.mixingEntriesService.listEntries(user);
  }

  @Get('available-pyrolysis-batches')
  listAvailablePyrolysisBatches(@AuthUser() user: AuthenticatedUser) {
    return this.mixingEntriesService.listAvailablePyrolysisBatches(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.mixingEntriesService.getEntry(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() payload: CreateMixingEntryPayload,
  ) {
    return this.mixingEntriesService.createEntry(user, payload);
  }

  @Put(':id/entry-status')
  submitEntryStatus(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SubmitMixingEntryStatusPayload,
  ) {
    return this.mixingEntriesService.submitEntryStatus(user, id, body);
  }
}
