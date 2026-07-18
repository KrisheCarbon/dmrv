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
import type { FarmUpsertPayload } from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { FarmsService } from './farms.service';

@Controller('farms')
@UseGuards(SupabaseAuthGuard)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.farmsService.findAll(user);
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
