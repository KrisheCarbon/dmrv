import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthLookupService } from './auth-lookup.service';
import { CognitoTokenService } from './cognito-token.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, AuthLookupService, CognitoTokenService],
  exports: [SupabaseAuthGuard, CognitoTokenService],
})
export class AuthModule {}
