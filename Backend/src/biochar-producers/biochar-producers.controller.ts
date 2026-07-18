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
  BiocharProducersService,
  type CreateProducerPayload,
  type UpdateProducerPayload,
} from './biochar-producers.service';

@Controller('biochar-producers')
@UseGuards(SupabaseAuthGuard)
export class BiocharProducersController {
  constructor(
    private readonly biocharProducersService: BiocharProducersService,
  ) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.biocharProducersService.findAll(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.biocharProducersService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: CreateProducerPayload,
  ) {
    return this.biocharProducersService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateProducerPayload,
  ) {
    return this.biocharProducersService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.biocharProducersService.remove(user, id);
  }
}
