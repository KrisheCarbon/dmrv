import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { MobileNetworkService } from './mobile-network.service';

@Controller('mobile-network')
@UseGuards(SupabaseAuthGuard)
export class MobileNetworkController {
  constructor(private readonly mobileNetworkService: MobileNetworkService) {}

  /** Name, village, district, mobile; plot id and area; kontikki id, registry, volume. */
  @Get('directory')
  directory(@AuthUser() user: AuthenticatedUser) {
    return this.mobileNetworkService.getDirectory(user);
  }

  @Get()
  overview(@AuthUser() user: AuthenticatedUser) {
    return this.mobileNetworkService.getOverview(user);
  }
}
