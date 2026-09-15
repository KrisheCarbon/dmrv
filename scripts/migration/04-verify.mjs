#!/usr/bin/env node
/**
 * STEP 4 — reconcile what's in the DB against the spreadsheet. Read-only.
 *
 * Checks, per row:
 *   • the batch exists and its kontikki / batch number / yield match the sheet
 *   • every photo URL points at Supabase storage (not still at Kobo, not the
 *     placeholder) and actually resolves
 *   • moisture readings match
 *   • mixing links match the cited range minus genuinely-absent batches
 *
 * Which org this runs for is picked with --org=<name> (default "parkal").
 *
 *   node scripts/migration/04-verify.mjs --org=akrsp
 *   node scripts/migration/04-verify.mjs --org=akrsp --check-urls   # HEAD every photo URL
 */

import {
  ARGS, ORG, banner, log, warn, tally, printTally,
  select, stableId, readJson, writeJson, readJsonIfExists,
  requireSupabase, pool, loadConfig,
} from './lib/common.mjs';

const CONFIG = await loadConfig();

requireSupabase();
banner(`STEP 4 [${ORG}] — verification (read-only)`);

const CHECK_URLS = ARGS.includes('--check-urls');

const production = readJson('production_entries.json');
const mixing = readJson('mixing_entries.json');
const refs = readJson('ref-map.json');
const rows = CONFIG.includeFlagged ? production : production.filter((p) => !p.flagged);

const problems = [];
const note = (kind, ref, detail) => {
  problems.push({ kind, ref, detail });
  tally(kind);
};

// ── pull everything back ─────────────────────────────────────────────────────

const dbBatches = await select(
  'pyrolysis_batches',
  'select=id,batch_number,kontikki_code,yield_percent,feedstock_name,' +
    'moisture_reading_1,moisture_reading_2,moisture_reading_3,moisture_reading_4,moisture_reading_5,' +
    'feedstock_photo_url,moisture_photo_url_1,moisture_photo_url_2,moisture_photo_url_3,' +
    'moisture_photo_url_4,moisture_photo_url_5,stage_initial_photo_url,stage_middle_photo_url,' +
    'stage_final_photo_url,stage_quenching_photo_url,sample_photo_url,comment&limit=2000',
);
const byId = new Map(dbBatches.map((b) => [b.id, b]));

const dbMixing = await select(
  'mixing_entries',
  'select=id,farm_name,started_at,comment,biochar_photo_url,substrate_photo_url,mixing_photo_url&limit=500',
);
const mixById = new Map(dbMixing.map((m) => [m.id, m]));
const dbLinks = await select('mixing_pyrolysis_links', 'select=*&limit=5000');
const linksByEntry = new Map();
for (const l of dbLinks) {
  if (!linksByEntry.has(l.mixing_entry_id)) linksByEntry.set(l.mixing_entry_id, []);
  linksByEntry.get(l.mixing_entry_id).push(l);
}

log(`DB has ${dbBatches.length} pyrolysis batches, ${dbMixing.length} mixing entries, ${dbLinks.length} links\n`);

// ── pyrolysis reconciliation ─────────────────────────────────────────────────

const urlsToCheck = new Set();

for (const p of rows) {
  const id = stableId('batch', p.unique_code);
  const db = byId.get(id);
  if (!db) {
    note('batch MISSING from DB', p.unique_code, 'no row with the expected id');
    continue;
  }
  tally('batches present');

  if (String(db.batch_number ?? '') !== String(p.batch_number ?? ''))
    note('batch_number mismatch', p.unique_code, `sheet=${p.batch_number} db=${db.batch_number}`);
  if (db.kontikki_code !== p.kontikki_code)
    note('kontikki mismatch', p.unique_code, `sheet=${p.kontikki_code} db=${db.kontikki_code}`);
  if (p.yield_percent != null && Number(db.yield_percent) !== Number(p.yield_percent))
    note('yield mismatch', p.unique_code, `sheet=${p.yield_percent} db=${db.yield_percent}`);

  for (const m of p.moisture) {
    const got = db[`moisture_reading_${m.index}`];
    if (m.reading != null && Number(got) !== Number(m.reading))
      note('moisture mismatch', `${p.unique_code}#${m.index}`, `sheet=${m.reading} db=${got}`);
  }

  const photoFields = {
    feedstock_photo_url: p.photos.feedstock,
    stage_initial_photo_url: p.photos.stage_initial,
    stage_middle_photo_url: p.photos.stage_middle,
    stage_final_photo_url: p.photos.stage_final,
    stage_quenching_photo_url: p.photos.stage_quenching,
    sample_photo_url: p.photos.biochar_unloaded,
  };
  for (const m of p.moisture) photoFields[`moisture_photo_url_${m.index}`] = m;

  for (const [field, src] of Object.entries(photoFields)) {
    const got = db[field];
    if (!src?.kobo_url) continue;
    if (!got) {
      note('photo MISSING', `${p.unique_code}.${field}`, 'sheet has an attachment, db column is null');
      continue;
    }
    if (got.includes('kobotoolbox.org')) {
      note('photo still points at Kobo', `${p.unique_code}.${field}`, got);
      continue;
    }
    if (refs.placeholder_image_url && got === refs.placeholder_image_url) {
      note('photo is PLACEHOLDER', `${p.unique_code}.${field}`, 'original attachment was not migrated');
      continue;
    }
    tally('photos migrated OK');
    urlsToCheck.add(got);
  }
}

// ── mixing reconciliation ────────────────────────────────────────────────────

const sheetBatchNumbers = new Set(
  rows.map((p) => Number.parseInt(p.batch_number, 10)).filter(Number.isFinite),
);

for (const mx of mixing) {
  const id = stableId('mixing', mx.kobo_uuid ?? mx.start);
  const db = mixById.get(id);
  if (!db) {
    note('mixing entry MISSING from DB', mx.farmer_name, mx.batch_no_raw);
    continue;
  }
  tally('mixing entries present');

  const links = linksByEntry.get(id) ?? [];
  const cited = mx.batch_numbers ?? [];
  // Expected = cited batches that genuinely exist in the source sheet.
  const expected = cited.filter((n) => sheetBatchNumbers.has(n));
  const linked = new Set(links.map((l) => Number.parseInt(l.batch_number, 10)));

  const shouldHaveButDont = expected.filter((n) => !linked.has(n));
  const linkedButNotCited = [...linked].filter((n) => !cited.includes(n));

  if (shouldHaveButDont.length)
    note('mixing link MISSING', `${mx.farmer_name} (${mx.batch_no_raw})`, `expected but not linked: ${shouldHaveButDont.join(',')}`);
  if (linkedButNotCited.length)
    note('mixing link UNEXPECTED', `${mx.farmer_name} (${mx.batch_no_raw})`, `linked but not cited: ${linkedButNotCited.join(',')}`);
  if (!links.length)
    note('mixing entry has NO links', `${mx.farmer_name} (${mx.batch_no_raw})`, `cited ${cited.length}, none available`);

  tally('mixing links verified', links.length);

  for (const [field, src] of Object.entries({
    biochar_photo_url: mx.photos.biochar,
    substrate_photo_url: mx.photos.compost,
    mixing_photo_url: mx.photos.final_mixture,
  })) {
    if (!src?.kobo_url) continue;
    const got = db[field];
    if (!got) note('mixing photo MISSING', `${mx.farmer_name}.${field}`, '');
    else if (got.includes('kobotoolbox.org')) note('mixing photo still at Kobo', `${mx.farmer_name}.${field}`, got);
    else urlsToCheck.add(got);
  }
}

// ── optional: confirm the objects actually resolve ───────────────────────────

if (CHECK_URLS) {
  const list = [...urlsToCheck];
  log(`\nHEAD-checking ${list.length} storage URLs…`);
  let bad = 0;
  await pool(list, 8, async (u) => {
    try {
      const r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) {
        bad++;
        note('storage object not reachable', u, `HTTP ${r.status}`);
      }
    } catch {
      bad++;
      note('storage object not reachable', u, 'network error');
    }
  });
  log(`  ${list.length - bad}/${list.length} reachable`);
  if (bad) warn('Unreachable objects are usually the private "pyrolysis" bucket rejecting anonymous reads — check whether the dashboard signs these URLs.');
}

// ── result ───────────────────────────────────────────────────────────────────

writeJson('verification-report.json', {
  generated_at: new Date().toISOString(),
  checked_urls: CHECK_URLS,
  problem_count: problems.length,
  problems,
});

printTally();

if (!problems.length) {
  log('\n✓ Everything reconciles against the sheet.\n');
} else {
  log(`\n${problems.length} discrepancies — see data/verification-report.json`);
  const grouped = {};
  for (const p of problems) grouped[p.kind] = (grouped[p.kind] ?? 0) + 1;
  for (const [k, v] of Object.entries(grouped)) log(`   ${String(v).padStart(5)}  ${k}`);
  log('');
}
