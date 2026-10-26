import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from './auth-user.decorator';
import { AuthLookupService } from './auth-lookup.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { AuthenticatedUser } from './auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

const PROFILE_COLUMNS =
  'id, full_name, first_name, last_name, role, status, email, phone, collector_code';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authLookup: AuthLookupService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  @Post('login-email')
  @HttpCode(200)
  async loginEmail(@Body() body: { phone?: string }) {
    const email = await this.authLookup.emailForPhone(body.phone ?? '');
    return { email };
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async me(@AuthUser() user: AuthenticatedUser) {
    const { data, error } = await this.supabase
      .from('users')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException('User profile not found');
    }

    return data;
  }

  /** Used before a session exists, while someone is opening an invite. */
  @Post('signup-status')
  @HttpCode(200)
  async signupStatus(@Body() body: { email?: string }) {
    const email = body.email?.trim();
    if (!email) return { allowed: false, reason: 'not_found' };

    const { data, error } = await this.supabase
      .from('users')
      .select('status')
      .ilike('email', email)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) return { allowed: false, reason: 'not_found' };
    if (data.status === 'disabled') return { allowed: false, reason: 'disabled' };
    if (data.status === 'active') return { allowed: false, reason: 'already_active' };
    if (data.status === 'pending_auth') return { allowed: true };
    return { allowed: false, reason: 'unknown' };
  }

  @Post('signup-complete')
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  async signupComplete(@AuthUser() user: AuthenticatedUser) {
    const { error } = await this.supabase
      .from('users')
      .update({ status: 'active' })
      .eq('id', user.id)
      .eq('status', 'pending_auth');

    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }
}
