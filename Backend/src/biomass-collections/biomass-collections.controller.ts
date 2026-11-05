import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { CreateBiomassCollectionPayload } from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { BiomassCollectionsService } from './biomass-collections.service';

@Controller('biomass-collections')
@UseGuards(SupabaseAuthGuard)
export class BiomassCollectionsController {
  constructor(private readonly biomassCollectionsService: BiomassCollectionsService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.biomassCollectionsService.listCollections(user);
  }

  @Get('farms')
  farms(@AuthUser() user: AuthenticatedUser) {
    return this.biomassCollectionsService.listMappedFarms(user);
  }

  @Get('farmer-names')
  farmerNames(@AuthUser() user: AuthenticatedUser) {
    return this.biomassCollectionsService.listFarmerNames(user);
  }

  @Get('farmer-fields/:farmId')
  farmerFields(@AuthUser() user: AuthenticatedUser, @Param('farmId') farmId: string) {
    return this.biomassCollectionsService.listFarmerFields(user, farmId);
  }

  @Get('drop-sites')
  dropSites(@AuthUser() user: AuthenticatedUser) {
    return this.biomassCollectionsService.listDropSites(user);
  }

  @Get('used-acres')
  usedAcres(@AuthUser() user: AuthenticatedUser) {
    return this.biomassCollectionsService.usedAcres(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.biomassCollectionsService.getCollection(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() payload: CreateBiomassCollectionPayload,
  ) {
    return this.biomassCollectionsService.createCollection(user, payload);
  }
}
