import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthLookupService } from './auth-lookup.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authLookup: AuthLookupService) {}

  @Post('login-email')
  @HttpCode(200)
  async loginEmail(@Body() body: { phone?: string }) {
    const email = await this.authLookup.emailForPhone(body.phone ?? '');
    return { email };
  }
}
