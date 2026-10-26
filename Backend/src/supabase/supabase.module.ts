import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';
export const SUPABASE_AUTH_CLIENT = 'SUPABASE_AUTH_CLIENT';

const logger = new Logger('Database');

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * supabase-js always calls `/rest/v1`. PostgREST on RDS serves the schema at
 * the root, and it must not see the Supabase service-role token.
 */
function createRdsClient(postgrestUrl: string): SupabaseClient {
  const origin = postgrestUrl.replace(/\/$/, '');
  return createClient(origin, 'local', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => forwardToPostgrest(input, init),
    },
  });
}

function forwardToPostgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const rawUrl = request ? request.url : input instanceof URL ? input.toString() : String(input);
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/^\/rest\/v1/, '') || '/';

  const headers = new Headers(init?.headers ?? request?.headers);
  headers.delete('authorization');
  headers.delete('apikey');

  const method = init?.method ?? request?.method ?? 'GET';
  const body = init?.body ?? request?.body;
  const next: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    signal: init?.signal ?? request?.signal,
  };
  if (body != null && method !== 'GET' && method !== 'HEAD') {
    next.body = body;
    next.duplex = 'half';
  }
  return fetch(url, next);
}

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_AUTH_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient => {
        const url = config.get<string>('SUPABASE_URL');
        const key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        if (!url || !key) {
          throw new Error(
            'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Backend/.env',
          );
        }
        return createSupabaseClient(url, key);
      },
    },
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient => {
        const postgrestUrl = config.get<string>('POSTGREST_URL')?.trim();
        if (postgrestUrl) {
          logger.log('Table queries use the AWS database');
          return createRdsClient(postgrestUrl);
        }

        const url = config.get<string>('SUPABASE_URL');
        const key = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        if (!url || !key) {
          throw new Error(
            'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Backend/.env',
          );
        }
        logger.log('Table queries use Supabase');
        return createSupabaseClient(url, key);
      },
    },
  ],
  exports: [SUPABASE_CLIENT, SUPABASE_AUTH_CLIENT],
})
export class SupabaseModule {}
