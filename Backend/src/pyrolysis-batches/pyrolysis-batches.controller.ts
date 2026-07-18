import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { SubmitPyrolysisBatchStatusPayload } from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PyrolysisBatchesService } from './pyrolysis-batches.service';

@Controller('pyrolysis-batches')
@UseGuards(SupabaseAuthGuard)
export class PyrolysisBatchesController {
  constructor(private readonly pyrolysisBatchesService: PyrolysisBatchesService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.pyrolysisBatchesService.list(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pyrolysisBatchesService.findById(user, id);
  }

  @Put(':id/batch-status')
  submitBatchStatus(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SubmitPyrolysisBatchStatusPayload,
  ) {
    return this.pyrolysisBatchesService.submitBatchStatus(user, id, body);
  }
}
