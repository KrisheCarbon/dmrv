/**
 * Cognito User Migration trigger.
 *
 * On the first sign-in, Cognito calls this function. The password is checked
 * against Supabase. Cognito then stores its own hash. public.users.id is
 * returned as custom:legacy_id so kiln runs and farms stay attached to the
 * same person.
 *
 * Pool setup before this will run:
 * - Username: email (the same address Supabase uses, including
 *   98xxxxxxxx@phone.krishecarbon.invalid for a phone-only account)
 * - App client with USER_PASSWORD_AUTH
 * - Custom attribute legacy_id (string, mutable)
 * - This function as the User migration trigger
 * - Environment: SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * People with no password (email-code only, or pending_auth) are not migrated
 * here. They need a reset or a new invite after the pool exists.
 * Forgot-password confirms the account exists, then Cognito sends the reset.
 */

const PHONE_LOGIN_DOMAIN = 'phone.krishecarbon.invalid';

export async function handler(event) {
  if (event.triggerSource === 'UserMigration_Authentication') {
    const user = await signInWithPassword(event.userName, event.request?.password);
    return confirm(event, user.id, user.email);
  }

  if (event.triggerSource === 'UserMigration_ForgotPassword') {
    const email = normalizeEmail(event.userName);
    if (!email || email.endsWith(`@${PHONE_LOGIN_DOMAIN}`)) {
      throw new Error('This account has no inbox for a reset email.');
    }
    const id = await lookupUserId(email);
    if (!id) throw new Error('User does not exist.');
    return confirm(event, id, email);
  }

  return event;
}

function confirm(event, legacyId, email) {
  event.response.userAttributes = {
    email,
    email_verified: 'true',
    'custom:legacy_id': legacyId,
  };
  event.response.finalUserStatus = 'CONFIRMED';
  event.response.messageAction = 'SUPPRESS';
  event.response.desiredDeliveryMediums = [];
  return event;
}

async function signInWithPassword(username, password) {
  const email = normalizeEmail(username);
  if (!email || !password) throw new Error('Bad credentials');

  const { url, anon } = supabase();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => null);
  const id = body?.user?.id;
  const returnedEmail = body?.user?.email;
  if (!response.ok || typeof id !== 'string') {
    throw new Error('Bad credentials');
  }
  return { id, email: typeof returnedEmail === 'string' ? returnedEmail : email };
}

async function lookupUserId(email) {
  const { url, anon } = supabase();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const key = service || anon;
  const response = await fetch(
    `${url}/rest/v1/users?select=id,status&email=eq.${encodeURIComponent(email)}&limit=1`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.status === 'disabled' || typeof row.id !== 'string') return null;
  return row.id;
}

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error('Supabase is not configured for migration.');
  return { url, anon };
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}
