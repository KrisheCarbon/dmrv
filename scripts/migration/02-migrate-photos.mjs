#!/usr/bin/env node
/**
 * STEP 2 — copy Kobo attachments into Supabase storage.
 *
 * READ-ONLY against Kobo. Only ever issues GET. Nothing in Kobo is modified or
 * deleted — the Kobo submissions remain the source of truth.
 *
 * Downloads are cached in scripts/migration/photos/ keyed by attachment id, so
 * an interrupted run resumes without re-fetching, and a failed upload can be
 * retried without touching Kobo again.
 *
 * Which org this runs for is picked with --org=<name> (default "parkal").
 *
 * Output: data/<org>/photo-map.json  { "<kobo_url>": "<supabase public url>" }
 *
 *   node scripts/migration/02-migrate-photos.mjs --org=akrsp   # dry run (counts only)
 *   node scripts/migration/02-migrate-photos.mjs --org=akrsp --apply
 *   node scripts/migration/02-migrate-photos.mjs --org=akrsp --apply --download-only
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ARGS, APPLY, DRY_RUN, ENV, HERE, ORG,
  banner, log, warn, fail, vlog, tally, printTally,
  uploadObject, stableId, readJson, writeJson, readJsonIfExists,
  requireSupabase, pool, sleep, loadConfig,
} from './lib/common.mjs';

const CONFIG = await loadConfig();

requireSupabase();
banner(`STEP 2 [${ORG}] — Kobo attachments → Supabase storage`);

const DOWNLOAD_ONLY = ARGS.includes('--download-only');
const TOKEN = ENV[CONFIG.kobo.tokenEnvVar];

const production = readJson('production_entries.json');
const mixing = readJson('mixing_entries.json');
const refs = readJson('ref-map.json');

const rows = CONFIG.includeFlagged ? production : production.filter((p) => !p.flagged);

const CACHE_DIR = resolve(HERE, CONFIG.kobo.cacheDir, ORG);
mkdirSync(CACHE_DIR, { recursive: true });

// ── build the work list ──────────────────────────────────────────────────────
// Each job knows its destination path up front, derived from the deterministic
// batch/entry id so it matches what step 3 will write into the DB.

const jobs = [];

for (const p of rows) {
  const batchId = stableId('batch', p.unique_code);
  const base = `batches/${batchId}`;
  const push = (photo, path, field) => {
    if (!photo?.kobo_url) return;
    jobs.push({
      kobo_url: photo.kobo_url,
      filename: photo.filename,
      bucket: CONFIG.buckets.pyrolysis,
      path: `${base}/${path}`,
      ref: `${p.unique_code}.${field}`,
    });
  };
  push(p.photos.feedstock, 'feedstock.jpg', 'feedstock');
  push(p.photos.stage_initial, 'stages/initial.jpg', 'stage_initial');
  push(p.photos.stage_middle, 'stages/middle.jpg', 'stage_middle');
  push(p.photos.stage_final, 'stages/final.jpg', 'stage_final');
  push(p.photos.stage_quenching, 'stages/quenching.jpg', 'stage_quenching');
  push(p.photos.biochar_unloaded, 'stages/unloaded.jpg', 'biochar_unloaded');
  for (const m of p.moisture) {
    if (!m.kobo_url) continue;
    jobs.push({
      kobo_url: m.kobo_url,
      filename: m.filename,
      bucket: CONFIG.buckets.pyrolysis,
      path: `${base}/moisture/${m.index}.jpg`,
      ref: `${p.unique_code}.moisture_${m.index}`,
    });
  }
}

for (const m of mixing) {
  const entryId = stableId('mixing', m.kobo_uuid ?? m.start);
  const base = `entries/${entryId}`;
  const map = {
    biochar: 'biochar.jpg',
    compost: 'substrate.jpg',
    final_mixture: 'mixing.jpg',
    farmer: 'farmer.jpg',
    consent: 'consent.jpg',
  };
  for (const [key, file] of Object.entries(map)) {
    const photo = m.photos[key];
    if (!photo?.kobo_url) continue;
    jobs.push({
      kobo_url: photo.kobo_url,
      filename: photo.filename,
      bucket: CONFIG.buckets.mixing,
      path: `${base}/${file}`,
      ref: `${m.kobo_uuid}.${key}`,
    });
  }
}

log(`${jobs.length} attachments to move`);
log(`  pyrolysis bucket: ${jobs.filter((j) => j.bucket === CONFIG.buckets.pyrolysis).length}`);
log(`  mixing bucket:    ${jobs.filter((j) => j.bucket === CONFIG.buckets.mixing).length}\n`);

if (!TOKEN) {
  fail(
    `No Kobo token. Add ${CONFIG.kobo.tokenEnvVar}=<key> to Backend/.env or scripts/migration/.env\n` +
    `Get it at ${CONFIG.kobo.baseUrl}/#/account/security → API Key.`,
  );
}

if (DRY_RUN) {
  log('Dry run — nothing downloaded or uploaded. Re-run with --apply.\n');
  printTally();
  process.exit(0);
}

// ── fetch + upload ───────────────────────────────────────────────────────────

const photoMap = readJsonIfExists('photo-map.json', {});
const failures = [];

/** Attachment id from ".../attachments/attXXXX/" — stable cache key. */
function cacheKey(url) {
  const m = String(url).match(/attachments\/([^/?]+)/);
  return m ? m[1] : Buffer.from(String(url)).toString('base64url').slice(0, 48);
}

async function fetchKobo(url, attempt = 1) {
  const res = await fetch(url, {
    headers: { Authorization: `Token ${TOKEN}`, Accept: '*/*' },
    redirect: 'follow',
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  if (res.status === 429 || res.status >= 500) {
    if (attempt < CONFIG.kobo.retries) {
      await sleep(1000 * attempt * attempt);
      return fetchKobo(url, attempt + 1);
    }
  }
  throw new Error(`kobo ${res.status}`);
}

let done = 0;
await pool(jobs, CONFIG.kobo.concurrency, async (job) => {
  if (photoMap[job.kobo_url]) {
    tally('already migrated (skipped)');
    return;
  }

  const cachePath = resolve(CACHE_DIR, cacheKey(job.kobo_url) + '.bin');
  let bytes;

  try {
    if (existsSync(cachePath)) {
      bytes = readFileSync(cachePath);
      tally('served from local cache');
    } else {
      bytes = await fetchKobo(job.kobo_url);
      writeFileSync(cachePath, bytes);
      tally('downloaded from Kobo');
    }
  } catch (e) {
    failures.push({ ...job, stage: 'download', error: String(e.message ?? e) });
    tally('DOWNLOAD FAILED');
    return;
  }

  if (DOWNLOAD_ONLY) return;

  const ct = /\.png$/i.test(job.filename ?? '') ? 'image/png' : 'image/jpeg';
  try {
    photoMap[job.kobo_url] = await uploadObject(job.bucket, job.path, bytes, ct);
  } catch (e) {
    failures.push({ ...job, stage: 'upload', error: String(e.message ?? e) });
    tally('UPLOAD FAILED');
    return;
  }

  if (++done % 50 === 0) {
    log(`  ${done}/${jobs.length}…`);
    writeJson('photo-map.json', photoMap);
  }
});

writeJson('photo-map.json', photoMap);
if (failures.length) {
  writeJson('photo-failures.json', failures);
  warn(`${failures.length} attachments failed — see data/photo-failures.json`);
  warn('Step 3 substitutes the placeholder image for these and records the gap.');
}

printTally();
log(`\nMapped ${Object.keys(photoMap).length}/${jobs.length} attachments.`);
log('Kobo was only ever read from. Nothing there was changed.\n');
log(failures.length ? 'Re-run this script to retry failures (cache makes it cheap).\n' : 'Next: 03-migrate-entries.mjs\n');
