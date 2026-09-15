import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  PyrolysisStep,
  StartPyrolysisSessionPayload,
} from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  PyrolysisSessionsService,
  type UpdatePyrolysisBatchPayload,
} from './pyrolysis-sessions.service';

@Controller('pyrolysis-sessions')
@UseGuards(SupabaseAuthGuard)
export class PyrolysisSessionsController {
  constructor(
    private readonly pyrolysisSessionsService: PyrolysisSessionsService,
  ) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.pyrolysisSessionsService.listSessions(user);
  }

  @Get('review-statuses')
  listReviewStatuses(@AuthUser() user: AuthenticatedUser) {
    return this.pyrolysisSessionsService.listBatchReviewStatuses(user);
  }

  @Post('start')
  start(
    @AuthUser() user: AuthenticatedUser,
    @Body() payload: StartPyrolysisSessionPayload,
  ) {
    return this.pyrolysisSessionsService.startSession(user, payload);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pyrolysisSessionsService.getSession(user, id);
  }

  @Patch(':id/step')
  updateStep(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { current_step: PyrolysisStep },
  ) {
    return this.pyrolysisSessionsService.updateSessionStep(
      user,
      id,
      body.current_step,
    );
  }

  @Patch(':id/batches/:batchId')
  updateBatch(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('batchId') batchId: string,
    @Body() payload: UpdatePyrolysisBatchPayload,
  ) {
    return this.pyrolysisSessionsService.updateBatch(user, id, batchId, payload);
  }

  @Delete(':id/batches/:batchId')
  deleteBatch(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('batchId') batchId: string,
  ) {
    return this.pyrolysisSessionsService.deleteBatch(user, id, batchId);
  }

  @Post(':id/complete')
  complete(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pyrolysisSessionsService.completeSession(user, id);
  }
}
