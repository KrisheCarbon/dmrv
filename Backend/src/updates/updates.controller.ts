import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { UpdatesService, type CreateUpdatePayload } from './updates.service';

@Controller('updates')
@UseGuards(SupabaseAuthGuard)
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('inbox')
  inbox(@AuthUser() user: AuthenticatedUser) {
    return this.updatesService.inbox(user);
  }

  @Get('sent')
  sent(@AuthUser() user: AuthenticatedUser) {
    return this.updatesService.sent(user);
  }

  @Get('recipients')
  recipients(@AuthUser() user: AuthenticatedUser, @Query('q') query?: string) {
    return this.updatesService.recipients(user, query ?? '');
  }

  @Post()
  create(@AuthUser() user: AuthenticatedUser, @Body() body: CreateUpdatePayload) {
    return this.updatesService.create(user, body);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@AuthUser() user: AuthenticatedUser) {
    return this.updatesService.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.updatesService.markRead(user, id);
  }
}
