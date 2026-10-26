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

/** The always-on API. Table reads and writes on this host use the AWS database. */
export const AWS_BACKEND_URL = "https://d3einqtwag7iu2.cloudfront.net";

/** NestJS API base URL. Production uses the AWS host, including when an old Render URL is still set. */
export function getBackendUrl(): string {
  const configured = (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    ""
  ).trim();
  const production = process.env.NODE_ENV === "production";
  const stale =
    !configured ||
    /localhost|127\.0\.0\.1|onrender\.com/i.test(configured);

  if (stale) {
    return production ? AWS_BACKEND_URL : configured || "http://localhost:3001";
  }

  return configured;
}
