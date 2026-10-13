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
