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
  ClustersService,
  type ClusterUpsertPayload,
} from './clusters.service';
import type { ClusterVillageRecord } from '@krishecarbon/shared';

@Controller('clusters')
@UseGuards(SupabaseAuthGuard)
export class ClustersController {
  constructor(private readonly clustersService: ClustersService) {}

  @Get('form-options')
  formOptions(@AuthUser() user: AuthenticatedUser) {
    return this.clustersService.formOptions(user);
  }

  @Get('village-options')
  villageOptions(
    @AuthUser() user: AuthenticatedUser,
  ): Promise<ClusterVillageRecord[]> {
    return this.clustersService.listVillageOptions(user);
  }

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.clustersService.findAll(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clustersService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: ClusterUpsertPayload,
  ) {
    return this.clustersService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ClusterUpsertPayload,
  ) {
    return this.clustersService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clustersService.remove(user, id);
  }
}
