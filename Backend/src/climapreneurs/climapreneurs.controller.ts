import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import {
  ClimapreneursService,
  type UpsertBankAccountPayload,
} from './climapreneurs.service';

@Controller('climapreneurs')
@UseGuards(SupabaseAuthGuard)
export class ClimapreneursController {
  constructor(private readonly climapreneursService: ClimapreneursService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.climapreneursService.findAll(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.climapreneursService.findById(user, id);
  }

  @Put(':id/bank-account')
  upsertBankAccount(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpsertBankAccountPayload,
  ) {
    return this.climapreneursService.upsertBankAccount(user, id, body);
  }
}
