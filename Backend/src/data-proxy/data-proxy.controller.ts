import {
  All,
  Controller,
  ForbiddenException,
  Inject,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canAccessWebPortal, canManageUsers } from '@krishecarbon/shared';
import type { Request, Response } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'prefer',
  'range',
  'accept-profile',
  'content-profile',
];

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'content-location',
  'preference-applied',
  'location',
];

/**
 * Authenticated pass-through to the API database.
 * Portal users can read. Account managers can write. Anyone signed in can
 * read their own users row. Field saves still go through the checked routes.
 */
@Controller('data')
@UseGuards(SupabaseAuthGuard)
export class DataProxyController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = (req as Request & { authUser?: AuthenticatedUser }).authUser;
    if (!user) {
      throw new ForbiddenException('You cannot access this record.');
    }
    const targetPath = req.originalUrl.replace(/^\/data/, '') || '/';
    this.assertAllowed(req.method, targetPath, user);

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = req.header(name);
      if (value) headers.set(name, value);
    }

    const postgrestUrl = this.config.get<string>('POSTGREST_URL')?.trim();
    let upstreamUrl: string;
    if (postgrestUrl) {
      upstreamUrl = `${postgrestUrl.replace(/\/$/, '')}${targetPath}`;
    } else {
      const supabaseUrl = this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
      const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !key) {
        throw new ForbiddenException('Database is not configured.');
      }
      upstreamUrl = `${supabaseUrl}/rest/v1${targetPath}`;
      headers.set('apikey', key);
      headers.set('authorization', `Bearer ${key}`);
    }

    const method = req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });

    res.status(upstream.status);
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  }

  private assertAllowed(method: string, targetPath: string, user: AuthenticatedUser): void {
    const verb = method.toUpperCase();
    const reading = verb === 'GET' || verb === 'HEAD';
    if (reading && this.isOwnUserRead(targetPath, user.id)) return;
    if (reading && canAccessWebPortal(user.role)) return;
    if (!reading && canManageUsers(user.role)) return;
    throw new ForbiddenException('You cannot access this record.');
  }

  private isOwnUserRead(targetPath: string, userId: string): boolean {
    const url = new URL(targetPath, 'http://data.local');
    return url.pathname === '/users' && url.searchParams.get('id') === `eq.${userId}`;
  }
}
