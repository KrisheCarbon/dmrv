/**
 * Shared helpers: env loading, Supabase REST/storage wrappers, deterministic
 * IDs, dry-run guard, logging.
 *
 * SAFETY: this module exposes no DELETE helper. Nothing in the migration can
 * remove a row or an object.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
export const ROOT = resolve(HERE, '../..');

// ── org selection ────────────────────────────────────────────────────────────
// Multiple producers now share this pipeline (Parkal, AKRSP, ...). Pick the
// active one with --org=<name> (defaults to "parkal" for backward compat).
// Each org gets its own config (./configs/<org>.mjs) and its own data
// directory (./data/<org>/) so runs never mix up ids or photo caches.

export const ORG = (() => {
  const flag = process.argv.slice(2).find((a) => a.startsWith('--org='));
  return flag ? flag.split('=')[1] : 'parkal';
})();

export const DATA_DIR = resolve(HERE, 'data', ORG);
mkdirSync(DATA_DIR, { recursive: true });

export async function loadConfig() {
  const mod = await import(resolve(HERE, 'configs', `${ORG}.mjs`).replace(/^/, 'file://'));
  return mod.default;
}

// ── env ──────────────────────────────────────────────────────────────────────

function parseEnvFile(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export const ENV = {
  ...parseEnvFile(resolve(ROOT, 'Backend/.env')),
  ...parseEnvFile(resolve(HERE, '.env')),
  ...process.env,
};

export const SUPABASE_URL = ENV.SUPABASE_URL;
export const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

export function requireSupabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked Backend/.env).');
  }
}

// ── CLI flags ────────────────────────────────────────────────────────────────

export const ARGS = process.argv.slice(2);
export const APPLY = ARGS.includes('--apply');
export const DRY_RUN = !APPLY;
export const VERBOSE = ARGS.includes('--verbose');

export function banner(title) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`  ${DRY_RUN ? 'DRY RUN — nothing will be written. Add --apply to write.' : 'APPLY MODE — writing to ' + SUPABASE_URL}`);
  console.log(`${'═'.repeat(72)}\n`);
}

// ── logging ──────────────────────────────────────────────────────────────────

const counters = {};
export function tally(key, n = 1) {
  counters[key] = (counters[key] ?? 0) + n;
}
export function printTally() {
  console.log('\nSummary:');
  for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(46)} ${v}`);
}
export function log(...a) {
  console.log(...a);
}
export function vlog(...a) {
  if (VERBOSE) console.log('   ', ...a);
}
export function warn(...a) {
  console.warn('  ! ', ...a);
}
export function fail(msg) {
  console.error(`\nFATAL: ${msg}\n`);
  process.exit(1);
}

// ── deterministic IDs (UUID v5, SHA-1, fixed namespace) ──────────────────────
// Makes every script re-runnable: a second run upserts the same rows instead of
// creating duplicates.

const NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function hexToBytes(hex) {
  const clean = hex.replace(/-/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function stableId(kind, key) {
  const name = Buffer.from(`krishe-migration:${kind}:${key}`, 'utf8');
  const hash = createHash('sha1')
    .update(Buffer.from(hexToBytes(NAMESPACE)))
    .update(name)
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Supabase REST ────────────────────────────────────────────────────────────

function restHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function select(table, query = 'select=*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: restHeaders(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SELECT ${table}: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

/**
 * Insert-or-update on primary key. Never deletes.
 * In dry-run, logs and returns the rows unchanged.
 */
export async function upsert(table, rows, { onConflict = 'id' } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return [];

  if (DRY_RUN) {
    tally(`would upsert → ${table}`, list.length);
    vlog(`[dry] upsert ${table} x${list.length}`, VERBOSE ? JSON.stringify(list[0]).slice(0, 400) : '');
    return list;
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: restHeaders({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(list),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`UPSERT ${table}: ${res.status} ${text.slice(0, 600)}`);
  }
  tally(`upserted → ${table}`, list.length);
  return JSON.parse(text || '[]');
}

/** Update by filter. Never deletes. */
export async function patch(table, query, body) {
  if (DRY_RUN) {
    tally(`would patch → ${table}`);
    return [];
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: restHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${text.slice(0, 400)}`);
  tally(`patched → ${table}`);
  return JSON.parse(text || '[]');
}

// ── Supabase storage ─────────────────────────────────────────────────────────

export async function listBuckets() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/** Uploads with upsert:true. Returns the public-format URL (matches Mobile). */
export async function uploadObject(bucket, path, bytes, contentType = 'image/jpeg') {
  if (DRY_RUN) {
    tally(`would upload → ${bucket}`);
    return publicUrl(bucket, path);
  }
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`UPLOAD ${bucket}/${path}: ${res.status} ${t.slice(0, 300)}`);
  }
  tally(`uploaded → ${bucket}`);
  return publicUrl(bucket, path);
}

export function publicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── json helpers ─────────────────────────────────────────────────────────────

export function readJson(name) {
  const p = resolve(DATA_DIR, name);
  if (!existsSync(p)) fail(`Missing ${p}. Run the earlier step first.`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeJson(name, value) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, name), JSON.stringify(value, null, 1));
  log(`  wrote data/${name}`);
}

export function readJsonIfExists(name, fallback) {
  const p = resolve(DATA_DIR, name);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── misc ─────────────────────────────────────────────────────────────────────

/** Run tasks with bounded concurrency. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "PP003" → "PP". */
export function codePrefix(code) {
  return (code ?? '').replace(/[0-9].*$/, '');
}

/** Combine an ISO date with a clock string like "18:43:00.000+05:30". */
export function combineDateTime(isoDate, clock) {
  if (!isoDate) return null;
  const day = isoDate.slice(0, 10);
  if (!clock) return new Date(isoDate).toISOString();
  const m = String(clock).match(/^(\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return new Date(isoDate).toISOString();
  const tz = String(clock).match(/([+-]\d{2}:\d{2})$/)?.[1] ?? SOURCE_TZ_OFFSET;
  const d = new Date(`${day}T${m[1].length === 5 ? m[1] + ':00' : m[1]}${tz}`);
  return Number.isNaN(d.getTime()) ? new Date(isoDate).toISOString() : d.toISOString();
}

/**
 * Kobo writes naive local timestamps ("2026-06-12 07:36:47.388000") with no
 * zone. The data is from Telangana, so pin them to IST rather than letting the
 * result depend on whatever TZ the machine running the migration happens to be
 * in — otherwise the same script produces different timestamps on different
 * laptops.
 */
export const SOURCE_TZ_OFFSET = '+05:30';

export function toIso(v) {
  if (!v) return null;
  let s = String(v).trim();
  const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s);
  if (naive) s = s.replace(' ', 'T') + SOURCE_TZ_OFFSET;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00${SOURCE_TZ_OFFSET}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Photo metadata blob matching FieldPhotoMetadata in packages/shared. */
export function photoMeta({ captured_at, lat, lng, address, source }) {
  return {
    captured_at: captured_at ?? null,
    latitude: lat ?? null,
    longitude: lng ?? null,
    address: address ?? null,
    device_time_iso: captured_at ?? null,
    exif: { migrated_from: source ?? 'kobotoolbox' },
  };
}
