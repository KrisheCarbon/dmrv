import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  canSendUpdates,
  contactEmail,
  formatRoleLabel,
  isUserRole,
} from '@krishecarbon/shared';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import type { AuthenticatedUser } from '../auth/auth.types';

export type UpdateAudience = 'all' | 'role' | 'user';

export interface UpdateMessage {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  author_name: string | null;
}

export interface UpdateInbox {
  messages: UpdateMessage[];
  unread_count: number;
}

export interface SentUpdate {
  id: string;
  title: string;
  body: string;
  audience: UpdateAudience;
  audience_label: string;
  created_at: string;
  author_name: string | null;
}

export interface UpdateRecipient {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
}

export interface CreateUpdatePayload {
  title?: string;
  body?: string;
  audience?: string;
  target_role?: string;
  target_user_id?: string;
}

interface UpdateRow {
  id: string;
  title: string;
  body: string;
  audience: UpdateAudience;
  target_role: string | null;
  target_user_id: string | null;
  created_by: string;
  created_at: string;
}

const UPDATE_COLUMNS =
  'id, title, body, audience, target_role, target_user_id, created_by, created_at';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INBOX_LIMIT = 50;

@Injectable()
export class UpdatesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async inbox(user: AuthenticatedUser): Promise<UpdateInbox> {
    const rows = await this.visibleRows(user);
    const [readIds, names] = await Promise.all([
      this.readIds(
        user.id,
        rows.map((row) => row.id),
      ),
      this.loadNames(rows.map((row) => row.created_by)),
    ]);
    const messages = rows.map((row) => this.toMessage(row, names, readIds));
    return {
      messages,
      unread_count: messages.filter((message) => !message.read).length,
    };
  }

  async sent(user: AuthenticatedUser): Promise<SentUpdate[]> {
    this.assertCanSend(user);
    let query = this.supabase
      .from('updates')
      .select(UPDATE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT);

    if (user.role === 'supervisor') {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
    if (error) this.throwDb(error.message);
    const rows = (data ?? []) as UpdateRow[];
    const names = await this.loadNames([
      ...rows.map((row) => row.created_by),
      ...rows.map((row) => row.target_user_id).filter((id): id is string => Boolean(id)),
    ]);
    return rows.map((row) => this.toSent(row, names));
  }

  async recipients(user: AuthenticatedUser, rawQuery: string): Promise<UpdateRecipient[]> {
    this.assertCanSend(user);
    const term = rawQuery.replace(/[^a-zA-Z0-9 @+.-]/g, '').trim().slice(0, 60);

    let query = this.supabase
      .from('users')
      .select('id, full_name, role, email, phone, status')
      .in('status', ['active', 'pending_auth'])
      .order('full_name', { ascending: true })
      .limit(20);

    if (term) {
      const pattern = `%${term}%`;
      query = query.or(
        `full_name.ilike."${pattern}",email.ilike."${pattern}",phone.ilike."${pattern}"`,
      );
    }

    const { data, error } = await query;
    if (error) this.throwDb(error.message);

    return ((data ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: string;
      email: string | null;
      phone: string | null;
    }>).map((row) => ({
      id: row.id,
      full_name: row.full_name?.trim() || contactEmail(row.email) || row.phone || 'Unnamed',
      role: row.role,
      email: contactEmail(row.email),
      phone: row.phone,
    }));
  }

  async create(user: AuthenticatedUser, payload: CreateUpdatePayload): Promise<SentUpdate> {
    this.assertCanSend(user);
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const audience = payload.audience;

    if (!title) throw new BadRequestException('Write a title.');
    if (title.length > 120) {
      throw new BadRequestException('Keep the title under 120 characters.');
    }
    if (!body) throw new BadRequestException('Write a message.');
    if (body.length > 2000) {
      throw new BadRequestException('Keep the message under 2,000 characters.');
    }
    if (audience !== 'all' && audience !== 'role' && audience !== 'user') {
      throw new BadRequestException('Choose who should receive this.');
    }

    let targetRole: string | null = null;
    let targetUserId: string | null = null;
    let recipientName: string | null = null;

    if (audience === 'role') {
      const role = typeof payload.target_role === 'string' ? payload.target_role : '';
      if (!isUserRole(role)) throw new BadRequestException('Choose a role.');
      targetRole = role;
    }

    if (audience === 'user') {
      const id = typeof payload.target_user_id === 'string' ? payload.target_user_id : '';
      if (!UUID_RE.test(id)) throw new BadRequestException('Choose a person from the list.');
      const recipient = await this.loadRecipient(id);
      targetUserId = recipient.id;
      recipientName = recipient.full_name;
    }

    const { data, error } = await this.supabase
      .from('updates')
      .insert({
        title,
        body,
        audience,
        target_role: targetRole,
        target_user_id: targetUserId,
        created_by: user.id,
      })
      .select(UPDATE_COLUMNS)
      .single();

    if (error || !data) this.throwDb(error?.message ?? 'Could not send the update.');

    const row = data as UpdateRow;
    const names = await this.loadNames([user.id]);
    if (recipientName && targetUserId) names.set(targetUserId, recipientName);
    return this.toSent(row, names);
  }

  async markRead(user: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    if (!UUID_RE.test(id)) throw new NotFoundException('Update not found.');
    const row = await this.findVisible(user, id);
    const { error } = await this.supabase.from('update_reads').upsert(
      { update_id: row.id, user_id: user.id },
      { onConflict: 'update_id,user_id', ignoreDuplicates: true },
    );
    if (error) this.throwDb(error.message);
    return { ok: true };
  }

  async markAllRead(user: AuthenticatedUser): Promise<{ ok: true }> {
    const rows = await this.visibleRows(user);
    if (rows.length === 0) return { ok: true };
    const { error } = await this.supabase.from('update_reads').upsert(
      rows.map((row) => ({ update_id: row.id, user_id: user.id })),
      { onConflict: 'update_id,user_id', ignoreDuplicates: true },
    );
    if (error) this.throwDb(error.message);
    return { ok: true };
  }

  private assertCanSend(user: AuthenticatedUser) {
    if (!canSendUpdates(user.role)) {
      throw new ForbiddenException(
        'Only admins, managers, and supervisors can send updates.',
      );
    }
  }

  private async visibleRows(user: AuthenticatedUser): Promise<UpdateRow[]> {
    if (!UUID_RE.test(user.id)) {
      throw new BadRequestException('Could not load updates.');
    }
    const parts = [
      'audience.eq.all',
      `and(audience.eq.user,target_user_id.eq.${user.id})`,
    ];
    if (isUserRole(user.role)) {
      parts.push(`and(audience.eq.role,target_role.eq.${user.role})`);
    }

    const { data, error } = await this.supabase
      .from('updates')
      .select(UPDATE_COLUMNS)
      .or(parts.join(','))
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT);

    if (error) this.throwDb(error.message);
    return (data ?? []) as UpdateRow[];
  }

  private async findVisible(user: AuthenticatedUser, id: string): Promise<UpdateRow> {
    const { data, error } = await this.supabase
      .from('updates')
      .select(UPDATE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) this.throwDb(error.message);
    const row = data as UpdateRow | null;
    if (!row || !this.isVisible(user, row)) {
      throw new NotFoundException('Update not found.');
    }
    return row;
  }

  private isVisible(user: AuthenticatedUser, row: UpdateRow): boolean {
    if (row.audience === 'all') return true;
    if (row.audience === 'role') return row.target_role === user.role;
    if (row.audience === 'user') return row.target_user_id === user.id;
    return false;
  }

  private async readIds(userId: string, updateIds: string[]): Promise<Set<string>> {
    if (updateIds.length === 0) return new Set();
    const { data, error } = await this.supabase
      .from('update_reads')
      .select('update_id')
      .eq('user_id', userId)
      .in('update_id', updateIds);

    if (error) this.throwDb(error.message);
    return new Set(
      ((data ?? []) as Array<{ update_id: string }>).map((row) => row.update_id),
    );
  }

  private async loadNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const names = new Map<string, string>();
    if (unique.length === 0) return names;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name')
      .in('id', unique);

    if (error) this.throwDb(error.message);
    for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
      const name = row.full_name?.trim();
      if (name) names.set(row.id, name);
    }
    return names;
  }

  private async loadRecipient(id: string): Promise<{ id: string; full_name: string }> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name, email, phone, status')
      .eq('id', id)
      .maybeSingle();

    if (error) this.throwDb(error.message);
    const row = data as {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      status: string;
    } | null;
    if (!row) throw new BadRequestException('Choose a person from the list.');
    if (row.status === 'disabled') {
      throw new BadRequestException('That person cannot sign in, so they would not see this.');
    }
    return {
      id: row.id,
      full_name: row.full_name?.trim() || contactEmail(row.email) || row.phone || 'One person',
    };
  }

  private toMessage(
    row: UpdateRow,
    names: Map<string, string>,
    readIds: Set<string>,
  ): UpdateMessage {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: String(row.created_at),
      read: readIds.has(row.id),
      author_name: names.get(row.created_by) ?? null,
    };
  }

  private toSent(row: UpdateRow, names: Map<string, string>): SentUpdate {
    let audienceLabel = 'everyone';
    if (row.audience === 'role') {
      audienceLabel = `every ${formatRoleLabel(row.target_role ?? '')}`;
    }
    if (row.audience === 'user') {
      audienceLabel = (row.target_user_id && names.get(row.target_user_id)) || 'one person';
    }
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      audience: row.audience,
      audience_label: audienceLabel,
      created_at: String(row.created_at),
      author_name: names.get(row.created_by) ?? null,
    };
  }

  private throwDb(message: string): never {
    if (/does not exist|schema cache/i.test(message)) {
      throw new BadRequestException('Updates are not set up yet. Apply migration 060_updates.sql.');
    }
    throw new BadRequestException(message);
  }
}
