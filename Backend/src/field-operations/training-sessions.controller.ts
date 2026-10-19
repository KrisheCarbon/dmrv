import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { TrainingSessionsService } from './training-sessions.service';

@Controller('training-sessions')
@UseGuards(SupabaseAuthGuard)
export class TrainingSessionsController {
  constructor(private readonly sessions: TrainingSessionsService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.sessions.list(user);
  }

  @Get('options')
  options(@AuthUser() user: AuthenticatedUser) {
    return this.sessions.options(user);
  }

  @Post()
  create(@AuthUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.sessions.create(user, body as never);
  }
}
