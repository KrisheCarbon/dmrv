import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
@UseGuards(SupabaseAuthGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.inspections.list(user);
  }

  @Get('options')
  options(@AuthUser() user: AuthenticatedUser) {
    return this.inspections.options(user);
  }

  @Post()
  create(@AuthUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.inspections.create(user, body as never);
  }
}
