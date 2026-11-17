/**
 * Cognito User Migration trigger.
 *
 * Cognito calls this the first time a person signs in and is not in the pool
 * yet. The password they type is checked against the bcrypt hash from the
 * Supabase backup. On a match, Cognito stores its own hash and keeps
 * public.users.id in custom:legacy_id.
 *
 * Deploy this file together with password-hashes.json and node_modules/bcryptjs.
 * password-hashes.json is not committed.
 */

import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const PHONE_LOGIN_DOMAIN = 'phone.krishecarbon.invalid';

const accounts = loadAccounts();

export async function handler(event) {
  if (event.triggerSource === 'UserMigration_Authentication') {
    const email = normalizeEmail(event.userName);
    const password = event.request?.password ?? '';
    const account = accounts.get(email);
    if (!account || !(await bcrypt.compare(password, account.hash))) {
      throw new Error('Bad credentials');
    }
    return confirm(event, account.id, email, false);
  }

  if (event.triggerSource === 'UserMigration_ForgotPassword') {
    const email = normalizeEmail(event.userName);
    if (!email || email.endsWith(`@${PHONE_LOGIN_DOMAIN}`)) {
      throw new Error('This account has no inbox for a reset email.');
    }
    const account = accounts.get(email);
    if (!account) throw new Error('User does not exist.');
    return confirm(event, account.id, email, true);
  }

  return event;
}

/** Used by the local check. Never logs the hash. */
export async function passwordMatches(email, password) {
  const account = accounts.get(normalizeEmail(email));
  if (!account) return false;
  return bcrypt.compare(password, account.hash);
}

export function accountCount() {
  return accounts.size;
}

function loadAccounts() {
  const file = new URL('./password-hashes.json', import.meta.url);
  const body = JSON.parse(readFileSync(file, 'utf8'));
  const map = new Map();
  for (const account of body.accounts ?? []) {
    const email = normalizeEmail(account.email);
    if (!email || !account.id || !account.hash) continue;
    if (account.status === 'disabled') continue;
    map.set(email, { id: account.id, hash: account.hash });
  }
  return map;
}

function confirm(event, legacyId, email, deliverEmail) {
  event.response.userAttributes = {
    email,
    email_verified: 'true',
    'custom:legacy_id': legacyId,
  };
  event.response.finalUserStatus = 'CONFIRMED';
  event.response.messageAction = 'SUPPRESS';
  if (deliverEmail) {
    event.response.desiredDeliveryMediums = ['EMAIL'];
  }
  return event;
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}
