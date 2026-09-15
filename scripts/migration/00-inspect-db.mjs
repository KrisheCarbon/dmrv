#!/usr/bin/env node
/**
 * STEP 0 — READ ONLY. Writes nothing. Deletes nothing.
 *
 * Dumps the live Supabase schema + existing reference rows so the migration
 * script can be written against reality (the base schema for kontikkis /
 * biochar_producers / producer_sites / farms / users / feedstocks is NOT in
 * Backend/supabase/migrations — it only exists in the live DB).
 *
 * Run from repo root:
 *   node scripts/migration/00-inspect-db.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from Backend/.env.
 * Output: scripts/migration/data/db-snapshot.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT_DIR = resolve(HERE, 'data');

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(resolve(ROOT, 'Backend/.env')), ...process.env };
const URL_BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (looked in Backend/.env)');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(path) {
  const res = await fetch(`${URL_BASE}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) return { __error: `${res.status} ${text.slice(0, 400)}` };
  try {
    return JSON.parse(text);
  } catch {
    return { __error: 'non-json response' };
  }
}

// Tables we need to understand before writing the migration.
const TABLES = [
  'users',
  'partner_organizations',
  'biochar_producers',
  'producer_sites',
  'biochar_producer_supervisors',
  'kontikkis',
  'kontikki_operators',
  'feedstocks',
  'farms',
  'pyrolysis_sessions',
  'pyrolysis_batches',
  'pyrolysis_batch_status',
  'mixing_entries',
  'mixing_pyrolysis_links',
  'mixing_entry_status',
];

// Reference tables we want the full contents of (small, needed for FK mapping).
const DUMP_FULL = [
  'users',
  'partner_organizations',
  'biochar_producers',
  'producer_sites',
  'kontikkis',
  'kontikki_operators',
  'feedstocks',
];

const main = async () => {
  console.log(`Inspecting ${URL_BASE} (read-only)\n`);

  // 1. PostgREST OpenAPI spec → column names, types, required/NOT NULL fields.
  const spec = await get('/rest/v1/');
  const defs = spec?.definitions ?? {};

  const schema = {};
  for (const t of TABLES) {
    const d = defs[t];
    if (!d) {
      schema[t] = { __missing: 'table not exposed / does not exist' };
      continue;
    }
    schema[t] = {
      required: d.required ?? [],
      columns: Object.fromEntries(
        Object.entries(d.properties ?? {}).map(([col, p]) => [
          col,
          {
            type: p.format ?? p.type,
            description: p.description ?? undefined,
            // PostgREST puts "<pk>" / "<fk table.column>" markers in description
          },
        ]),
      ),
    };
  }

  // 2. Row counts.
  const counts = {};
  for (const t of TABLES) {
    if (schema[t].__missing) continue;
    const res = await fetch(`${URL_BASE}/rest/v1/${t}?select=*&limit=1`, {
      headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
    });
    counts[t] = res.headers.get('content-range')?.split('/')?.[1] ?? '?';
  }

  // 3. Full dump of small reference tables + 2 sample rows of the big ones.
  const data = {};
  for (const t of TABLES) {
    if (schema[t].__missing) continue;
    const limit = DUMP_FULL.includes(t) ? 1000 : 2;
    data[t] = await get(`/rest/v1/${t}?select=*&limit=${limit}`);
  }

  // 4. Storage buckets.
  const buckets = await get('/storage/v1/bucket');

  // 5. Enum-ish check constraints we care about, inferred from spec descriptions.
  const snapshot = {
    generated_at: new Date().toISOString(),
    supabase_url: URL_BASE,
    counts,
    schema,
    buckets: Array.isArray(buckets)
      ? buckets.map((b) => ({
          id: b.id,
          public: b.public,
          allowed_mime_types: b.allowed_mime_types,
          file_size_limit: b.file_size_limit,
        }))
      : buckets,
    data,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, 'db-snapshot.json');
  writeFileSync(outPath, JSON.stringify(snapshot, null, 1));

  console.log('Row counts:');
  for (const [t, c] of Object.entries(counts)) console.log(`  ${t.padEnd(32)} ${c}`);
  const missing = TABLES.filter((t) => schema[t].__missing);
  if (missing.length) console.log(`\nNot found: ${missing.join(', ')}`);
  console.log(`\nBuckets: ${Array.isArray(buckets) ? buckets.map((b) => b.id).join(', ') : 'n/a'}`);
  console.log(`\nWrote ${outPath}`);
  console.log('\nNOTE: this file contains real operator names/emails. Do not commit it.');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
