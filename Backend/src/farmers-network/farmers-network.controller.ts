import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  FarmFieldUpsertPayload,
  FarmerConsentUpsertPayload,
  SoilTestReportPayload,
  SoilTestReviewPayload,
  SoilTestSubmitPayload,
  SoilTestUpsertPayload,
} from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { FarmersNetworkService } from './farmers-network.service';

@Controller('farm-fields')
@UseGuards(SupabaseAuthGuard)
export class FarmFieldsController {
  constructor(private readonly farmersNetwork: FarmersNetworkService) {}

  @Get()
  list(
    @AuthUser() user: AuthenticatedUser,
    @Query('farmId') farmId?: string,
  ) {
    return this.farmersNetwork.listFields(user, farmId);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.farmersNetwork.getField(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: FarmFieldUpsertPayload,
  ) {
    return this.farmersNetwork.createField(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Partial<FarmFieldUpsertPayload>,
  ) {
    return this.farmersNetwork.updateField(user, id, body);
  }
}

@Controller('farmer-consents')
@UseGuards(SupabaseAuthGuard)
export class FarmerConsentsController {
  constructor(private readonly farmersNetwork: FarmersNetworkService) {}

  @Get()
  list(
    @AuthUser() user: AuthenticatedUser,
    @Query('farmId') farmId?: string,
  ) {
    return this.farmersNetwork.listConsents(user, farmId);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: FarmerConsentUpsertPayload,
  ) {
    return this.farmersNetwork.createConsent(user, body);
  }
}

@Controller('soil-tests')
@UseGuards(SupabaseAuthGuard)
export class SoilTestsController {
  constructor(private readonly farmersNetwork: FarmersNetworkService) {}

  @Get('form-options')
  formOptions(@AuthUser() user: AuthenticatedUser) {
    return this.farmersNetwork.getSoilFormOptions(user);
  }

  @Get()
  list(
    @AuthUser() user: AuthenticatedUser,
    @Query('farmId') farmId?: string,
    @Query('inbox') inbox?: string,
  ) {
    return this.farmersNetwork.listSoilTests(user, {
      farmId,
      inbox: inbox === '1' || inbox === 'true',
    });
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.farmersNetwork.getSoilTest(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: SoilTestUpsertPayload,
  ) {
    return this.farmersNetwork.createSoilTest(user, body);
  }

  @Patch(':id/submit')
  submit(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SoilTestSubmitPayload,
  ) {
    return this.farmersNetwork.submitSoilTest(
      user,
      id,
      body.submitted_to_supervisor_id,
    );
  }

  @Patch(':id/review')
  review(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SoilTestReviewPayload,
  ) {
    return this.farmersNetwork.reviewSoilTest(
      user,
      id,
      body.decision,
      body.receive_photo_url,
    );
  }

  @Patch(':id/receive')
  receive(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.farmersNetwork.receiveSoilTest(user, id);
  }

  @Patch(':id/report')
  report(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SoilTestReportPayload,
  ) {
    return this.farmersNetwork.attachSoilReport(user, id, body);
  }
}
