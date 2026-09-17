import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthLookupService } from './auth-lookup.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, AuthLookupService],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
