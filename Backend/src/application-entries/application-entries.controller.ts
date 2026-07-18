import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type {
  CreateApplicationEntryPayload,
  SubmitApplicationEntryStatusPayload,
} from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { ApplicationEntriesService } from './application-entries.service';

@Controller('application-entries')
@UseGuards(SupabaseAuthGuard)
export class ApplicationEntriesController {
  constructor(private readonly applicationEntriesService: ApplicationEntriesService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.applicationEntriesService.listEntries(user);
  }

  @Get('available-pyrolysis-batches')
  listAvailablePyrolysisBatches(@AuthUser() user: AuthenticatedUser) {
    return this.applicationEntriesService.listAvailablePyrolysisBatches(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationEntriesService.getEntry(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() payload: CreateApplicationEntryPayload,
  ) {
    return this.applicationEntriesService.createEntry(user, payload);
  }

  @Put(':id/entry-status')
  submitEntryStatus(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SubmitApplicationEntryStatusPayload,
  ) {
    return this.applicationEntriesService.submitEntryStatus(user, id, body);
  }
}
