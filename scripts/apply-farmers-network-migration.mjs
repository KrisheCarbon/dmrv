#!/usr/bin/env node
/**
 * Apply farmers-network migration to Supabase Postgres.
 *
 * Option A — Supabase Dashboard:
 *   Paste Backend/supabase/migrations/021_farmers_network.sql and Run.
 *
 * Option B — CLI:
 *   DATABASE_URL=... node scripts/apply-farmers-network-migration.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = resolve(
  ROOT,
  'Backend/supabase/migrations/021_farmers_network.sql',
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
  console.log('✅ farmers-network migration applied successfully.');
} catch (err) {
  console.error('❌ Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
