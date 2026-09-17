import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  findLoginEmailForPhone,
  isIndianMobileLogin,
  toLocalIndianMobile,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

@Injectable()
export class AuthLookupService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async emailForPhone(phone: string): Promise<string | null> {
    if (!isIndianMobileLogin(phone)) {
      throw new BadRequestException(
        'Enter a valid 10-digit mobile number (optionally with +91).',
      );
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('email, phone, status');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return findLoginEmailForPhone(data ?? [], toLocalIndianMobile(phone));
  }
}
