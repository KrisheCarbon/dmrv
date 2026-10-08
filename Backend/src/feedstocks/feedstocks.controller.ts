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
import { RainbowRecordsService, type LabPayload } from '../verification-reports/rainbow-records.service';
import {
  FeedstocksService,
  type CreateFeedstockPayload,
  type UpdateFeedstockPayload,
} from './feedstocks.service';

@Controller('feedstocks')
@UseGuards(SupabaseAuthGuard)
export class FeedstocksController {
  constructor(
    private readonly feedstocksService: FeedstocksService,
    private readonly rainbowRecordsService: RainbowRecordsService,
  ) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.feedstocksService.findAll(user);
  }

  @Get(':id/rainbow')
  rainbowDesk(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rainbowRecordsService.feedstockDesk(user, id);
  }

  @Post(':id/lab-samples')
  saveLabSample(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: LabPayload,
  ) {
    return this.rainbowRecordsService.saveFeedstockLab(user, id, body);
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
