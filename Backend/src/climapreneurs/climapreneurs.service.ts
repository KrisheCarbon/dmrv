import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { canAccessNetwork } from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface ClimapreneurBankAccountRecord {
  id: string;
  user_id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  bank_address: string;
  upi_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClimapreneurRecord {
  id: string;
  email: string;
  phone?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  created_at?: string;
  bank_account?: ClimapreneurBankAccountRecord | null;
  has_bank_account: boolean;
}

export interface UpsertBankAccountPayload {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch: string;
  bank_address: string;
  upi_id?: string | null;
}

type ClimapreneurUserRow = Omit<
  ClimapreneurRecord,
  'bank_account' | 'has_bank_account'
>;

const CLIMAPRENEUR_USER_SELECT = `
  id,
  email,
  phone,
  full_name,
  first_name,
  middle_name,
  last_name,
  status,
  created_at
`;

const BANK_ACCOUNT_SELECT = `
  id,
  user_id,
  account_holder_name,
  account_number,
  ifsc_code,
  bank_name,
  branch,
  bank_address,
  upi_id,
  created_by,
  created_at,
  updated_at
`;

@Injectable()
export class ClimapreneursService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canAccessNetwork(user.role)) {
      throw new ForbiddenException('Not allowed to manage climapreneurs');
    }
  }

  async findAll(user: AuthenticatedUser): Promise<ClimapreneurRecord[]> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('users')
      .select(CLIMAPRENEUR_USER_SELECT)
      .eq('role', 'climapreneur')
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const users = (data ?? []) as ClimapreneurUserRow[];
    const bankByUserId = await this.fetchBankAccountsByUserIds(
      users.map((row) => row.id),
    );

    return users.map((row) =>
      this.buildClimapreneurRecord(row, bankByUserId.get(row.id) ?? null),
    );
  }

  async findById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ClimapreneurRecord> {
    this.assertCanManage(user);

    const { data, error } = await this.supabase
      .from('users')
      .select(CLIMAPRENEUR_USER_SELECT)
      .eq('id', id)
      .eq('role', 'climapreneur')
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Climapreneur not found');
    }

    const bankAccount = await this.fetchBankAccountForUser(id);

    return this.buildClimapreneurRecord(
      data as ClimapreneurUserRow,
      bankAccount,
    );
  }

  async upsertBankAccount(
    user: AuthenticatedUser,
    climapreneurId: string,
    payload: UpsertBankAccountPayload,
  ): Promise<ClimapreneurBankAccountRecord> {
    this.assertCanManage(user);
    this.validateBankAccountPayload(payload);
    await this.ensureClimapreneurExists(climapreneurId);

    const { data: existing, error: existingError } = await this.supabase
      .from('climapreneur_bank_accounts')
      .select('id')
      .eq('user_id', climapreneurId)
      .maybeSingle();

    if (existingError) {
      throw new BadRequestException(existingError.message);
    }

    const bankPayload = {
      account_holder_name: payload.account_holder_name.trim(),
      account_number: payload.account_number.trim(),
      ifsc_code: payload.ifsc_code.trim().toUpperCase(),
      bank_name: payload.bank_name.trim(),
      branch: payload.branch.trim(),
      bank_address: payload.bank_address.trim(),
      upi_id: payload.upi_id?.trim() || null,
    };

    if (existing) {
      const { data, error } = await this.supabase
        .from('climapreneur_bank_accounts')
        .update(bankPayload)
        .eq('user_id', climapreneurId)
        .select(BANK_ACCOUNT_SELECT)
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      return data as ClimapreneurBankAccountRecord;
    }

    const { data, error } = await this.supabase
      .from('climapreneur_bank_accounts')
      .insert({
        user_id: climapreneurId,
        ...bankPayload,
        created_by: user.id,
      })
      .select(BANK_ACCOUNT_SELECT)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data as ClimapreneurBankAccountRecord;
  }

  private buildClimapreneurRecord(
    user: ClimapreneurUserRow,
    bankAccount: ClimapreneurBankAccountRecord | null,
  ): ClimapreneurRecord {
    return {
      ...user,
      bank_account: bankAccount,
      has_bank_account: Boolean(bankAccount),
    };
  }

  private async fetchBankAccountForUser(
    userId: string,
  ): Promise<ClimapreneurBankAccountRecord | null> {
    const bankByUserId = await this.fetchBankAccountsByUserIds([userId]);
    return bankByUserId.get(userId) ?? null;
  }

  private async fetchBankAccountsByUserIds(
    userIds: string[],
  ): Promise<Map<string, ClimapreneurBankAccountRecord>> {
    const bankByUserId = new Map<string, ClimapreneurBankAccountRecord>();

    if (userIds.length === 0) {
      return bankByUserId;
    }

    const { data, error } = await this.supabase
      .from('climapreneur_bank_accounts')
      .select(BANK_ACCOUNT_SELECT)
      .in('user_id', userIds);

    if (error) {
      if (this.isMissingBankAccountsTableError(error.message)) {
        return bankByUserId;
      }
      throw new BadRequestException(error.message);
    }

    for (const row of data ?? []) {
      const account = row as ClimapreneurBankAccountRecord;
      bankByUserId.set(account.user_id, account);
    }

    return bankByUserId;
  }

  private isMissingBankAccountsTableError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('climapreneur_bank_accounts') &&
      (normalized.includes('does not exist') ||
        normalized.includes('schema cache') ||
        normalized.includes('could not find the table'))
    );
  }

  private validateBankAccountPayload(payload: UpsertBankAccountPayload): void {
    if (!payload.account_holder_name?.trim()) {
      throw new BadRequestException('Account holder name is required.');
    }
    if (!payload.account_number?.trim()) {
      throw new BadRequestException('Account number is required.');
    }
    if (!payload.ifsc_code?.trim()) {
      throw new BadRequestException('IFSC code is required.');
    }
    if (!payload.bank_name?.trim()) {
      throw new BadRequestException('Bank name is required.');
    }
    if (!payload.branch?.trim()) {
      throw new BadRequestException('Branch is required.');
    }
    if (!payload.bank_address?.trim()) {
      throw new BadRequestException('Bank address is required.');
    }
  }

  private async ensureClimapreneurExists(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .eq('role', 'climapreneur')
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Climapreneur not found');
    }
  }
}
