function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to KrisheCarbonAdmin/.env.local (not .env.example).`
    );
  }
  return value;
}

// Values are loaded from .env.local by Next.js (see Next.js env docs).
// Use static process.env.* access so NEXT_PUBLIC_* vars are inlined in the client bundle.
export const supabaseUrl = assertEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL"
);

export const supabaseAnonKey = assertEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
);

export function getServiceRoleKey(): string {
  return assertEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY"
  );
}

/** NestJS API base URL (server-side). Falls back to public URL for local dev. */
export function getBackendUrl(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://localhost:3001"
  );
}
