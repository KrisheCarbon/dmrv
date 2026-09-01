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
  TrainingsService,
  type CreateTrainingPayload,
  type UpdateTrainingPayload,
} from './trainings.service';

@Controller('trainings')
@UseGuards(SupabaseAuthGuard)
export class TrainingsController {
  constructor(private readonly trainingsService: TrainingsService) {}

  @Get()
  list(@AuthUser() user: AuthenticatedUser) {
    return this.trainingsService.findAll(user);
  }

  @Get('form-options')
  formOptions(@AuthUser() user: AuthenticatedUser) {
    return this.trainingsService.getFormOptions(user);
  }

  @Get(':id')
  getOne(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trainingsService.findById(user, id);
  }

  @Post()
  create(
    @AuthUser() user: AuthenticatedUser,
    @Body() body: CreateTrainingPayload,
  ) {
    return this.trainingsService.create(user, body);
  }

  @Patch(':id')
  update(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateTrainingPayload,
  ) {
    return this.trainingsService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AuthUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trainingsService.remove(user, id);
  }
}
