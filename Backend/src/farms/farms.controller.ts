import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { FarmUpsertPayload } from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { FarmsService } from './farms.service';

@Controller('farms')
@UseGuards(SupabaseAuthGuard)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  /**
   * Without `page`: every visible farm (the app's sync uses this).
   * With `page`: one page for the portal, e.g.
   * ?page=2&pageSize=25&sort=name&dir=asc&name=s
   */
  @Get()
  list(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    if (query.page === undefined) return this.farmsService.findAll(user);
    return this.farmsService.findPage(user, {
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      sort: query.sort,
      dir: query.dir,
      filters: {
        name: query.name,
        mobile: query.mobile,
        location: query.location,
        state: query.state,
      },
    });
  }

  /** Is this mobile number free? Accepts any format, e.g. +91 98765 43210. */
  @Get('mobile-check')
  mobileCheck(
    @AuthUser() user: AuthenticatedUser,
    @Query('mobile') mobile: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.farmsService.mobileAvailability(user, mobile ?? '', excludeId);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.farmsService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: FarmUpsertPayload,
  ) {
    return this.farmsService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: FarmUpsertPayload,
  ) {
    return this.farmsService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.farmsService.remove(user, id);
  }
}
