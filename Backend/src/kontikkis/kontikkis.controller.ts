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
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  KontikkisService,
  type CreateKontikkiPayload,
  type UpdateKontikkiPayload,
} from './kontikkis.service';

@Controller('kontikkis')
@UseGuards(SupabaseAuthGuard)
export class KontikkisController {
  constructor(private readonly kontikkisService: KontikkisService) {}

  @Get()
  list(
    @AuthUser() user: AuthenticatedUser,
    @Query('biochar_producer_id') biocharProducerId?: string,
    @Query('operator_id') operatorId?: string,
    @Query('climapreneur_id') climapreneurId?: string,
  ) {
    return this.kontikkisService.findAll(
      user,
      biocharProducerId,
      operatorId ?? climapreneurId,
    );
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.kontikkisService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: CreateKontikkiPayload,
  ) {
    return this.kontikkisService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateKontikkiPayload,
  ) {
    return this.kontikkisService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.kontikkisService.remove(user, id);
  }
}
