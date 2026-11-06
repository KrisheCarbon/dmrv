export type TokenProvider = 'supabase' | 'cognito';

export type VerifiedIdentity = {
  provider: TokenProvider;
  /** Cognito sub, or the Supabase auth user id. */
  subject: string;
  /**
   * Existing public.users.id, carried on a migrated Cognito user as
   * custom:legacy_id. Absent for a Supabase session, where subject is that id.
   */
  legacyUserId: string | null;
};

/** The id stored on kiln runs, farms, and users.id. Never the new Cognito sub. */
export function applicationUserId(identity: VerifiedIdentity): string {
  return identity.legacyUserId ?? identity.subject;
}

type JwtPeek = {
  iss?: string;
  token_use?: string;
};

/** Reads the JWT body without trusting it. Used only to choose a verifier. */
export function peekJwt(token: string): JwtPeek | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    return {
      iss: typeof record.iss === 'string' ? record.iss : undefined,
      token_use: typeof record.token_use === 'string' ? record.token_use : undefined,
    };
  } catch {
    return null;
  }
}

export function isCognitoIssuer(issuer: string, expectedIssuer: string): boolean {
  return issuer.replace(/\/$/, '') === expectedIssuer.replace(/\/$/, '');
}

export function missingAuthSubjectColumn(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? '';
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    message.includes('auth_subject')
  );
}
