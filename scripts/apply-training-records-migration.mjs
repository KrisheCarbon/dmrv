#!/usr/bin/env node
/**
 * Apply training_records migration to Supabase Postgres.
 *
 * Option A — Supabase Dashboard (no extra env vars):
 *   1. Open https://supabase.com/dashboard/project/smvbbyrlaegecfgzoisd/sql/new
 *   2. Paste the contents of Backend/supabase/migrations/015_training_records.sql
 *   3. Click Run
 *
 * Option B — CLI (requires direct Postgres URL):
 *   Add to Backend/.env:
 *     DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
 *   Then: node scripts/apply-training-records-migration.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = resolve(
  ROOT,
  'Backend/supabase/migrations/015_training_records.sql',
);

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // optional
  }
  return out;
}

const env = {
  ...loadEnv(resolve(ROOT, 'Backend/.env')),
  ...process.env,
};

const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'Missing DATABASE_URL. Either add it to Backend/.env or run the SQL manually in Supabase Dashboard.',
  );
  console.error(
    'Dashboard: https://supabase.com/dashboard/project/smvbbyrlaegecfgzoisd/sql/new',
  );
  console.error(`Migration file: ${MIGRATION}`);
  process.exit(1);
}

const sql = readFileSync(MIGRATION, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log('✅ training_records migration applied successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
