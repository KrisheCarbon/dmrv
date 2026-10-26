import { Controller, ForbiddenException, Get, Inject, UseGuards } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessWebPortal } from '@krishecarbon/shared';
import { AuthUser } from '../auth/auth-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

@Controller('dashboard')
@UseGuards(SupabaseAuthGuard)
export class DashboardController {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  @Get('counts')
  async counts(@AuthUser() user: AuthenticatedUser) {
    if (!canAccessWebPortal(user.role)) {
      throw new ForbiddenException('You cannot view these counts.');
    }

    const [
      producers,
      kontikkis,
      farms,
      supervisors,
      climapreneurs,
      pendingIntents,
      clusters,
      partners,
    ] = await Promise.all([
      this.count('biochar_producers'),
      this.count('kontikkis'),
      this.count('farms'),
      this.count('users', 'role', 'supervisor'),
      this.count('users', 'role', 'climapreneur'),
      this.count('roi_intents', 'status', 'pending'),
      this.count('clusters'),
      this.count('partner_organizations'),
    ]);

    return {
      producers,
      kontikkis,
      farms,
      supervisors,
      climapreneurs,
      pendingIntents,
      clusters,
      partners,
    };
  }

  private async count(table: string, column?: string, value?: string): Promise<number> {
    let query = this.supabase.from(table).select('*', { count: 'exact', head: true });
    if (column && value) query = query.eq(column, value);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  }
}
