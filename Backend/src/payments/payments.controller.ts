import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('options')
  options(@AuthUser() user: AuthenticatedUser) {
    return this.paymentsService.options(user);
  }

  @Get('statement')
  statement(
    @AuthUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('payee_id') payeeId?: string,
  ) {
    return this.paymentsService.statement(user, { from, to, payee_id: payeeId });
  }

  @Get('rate-cards')
  listRateCards(@AuthUser() user: AuthenticatedUser) {
    return this.paymentsService.listRateCards(user);
  }

  @Post('rate-cards')
  createRateCard(@AuthUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.paymentsService.createRateCard(user, body);
  }

  @Put('rate-cards/:id')
  updateRateCard(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.paymentsService.updateRateCard(user, id, body);
  }

  @Post('rate-cards/:id/archive')
  archiveRateCard(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.archiveRateCard(user, id);
  }

  @Post('rate-cards/:id/restore')
  restoreRateCard(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.restoreRateCard(user, id);
  }

  @Post('disbursements')
  createDisbursement(@AuthUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.paymentsService.createDisbursement(user, body);
  }
}
