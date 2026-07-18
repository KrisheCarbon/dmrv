import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  FeedstocksService,
  type CreateFeedstockPayload,
  type UpdateFeedstockPayload,
} from './feedstocks.service';

@Controller('feedstocks')
@UseGuards(SupabaseAuthGuard)
export class FeedstocksController {
  constructor(private readonly feedstocksService: FeedstocksService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.feedstocksService.findAll(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.feedstocksService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: CreateFeedstockPayload,
  ) {
    return this.feedstocksService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateFeedstockPayload,
  ) {
    return this.feedstocksService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.feedstocksService.remove(user, id);
  }
}
