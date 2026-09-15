#!/usr/bin/env node
/**
 * STEP 3 — migrate the actual entries.
 *
 *   pyrolysis_sessions      one per production row
 *   pyrolysis_batches       one per production row (all readings + photo URLs)
 *   pyrolysis_batch_status  review status carried over from "Status of the batch"
 *   mixing_entries          one per mixing row
 *   mixing_pyrolysis_links  batch-range links, partial-tolerant
 *   mixing_entry_status     pending_review
 *
 * LINKING RULE (as specified): a mixing entry citing "1-10" links to whichever
 * of batches 1..10 actually exist. If batch 3 is missing, we link 1,2,4..10 and
 * record 3 as skipped — the entry is not dropped.
 *
 * Which org this runs for is picked with --org=<name> (default "parkal").
 *
 *   node scripts/migration/03-migrate-entries.mjs --org=akrsp            # dry run
 *   node scripts/migration/03-migrate-entries.mjs --org=akrsp --apply
 */

import {
  DRY_RUN, ORG,
  banner, log, warn, fail, vlog, tally, printTally,
  select, upsert, stableId, readJson, writeJson, readJsonIfExists,
  requireSupabase, combineDateTime, toIso, photoMeta, loadConfig,
} from './lib/common.mjs';

const CONFIG = await loadConfig();

requireSupabase();
banner(`STEP 3 [${ORG}] — pyrolysis + mixing entries`);

const production = readJson('production_entries.json');
const mixing = readJson('mixing_entries.json');
const refs = readJson('ref-map.json');
const photoMap = readJsonIfExists('photo-map.json', {});

const rows = CONFIG.includeFlagged ? production : production.filter((p) => !p.flagged);
const OPERATOR_ID = refs.operator_id;
const PLACEHOLDER = refs.placeholder_image_url ?? null;

if (!Object.keys(photoMap).length) {
  warn('photo-map.json is empty — run 02-migrate-photos.mjs first, or every photo will fall back to the placeholder.');
}

/** Resolve a Kobo URL to its migrated Supabase URL, or the placeholder. */
let missingPhotos = 0;
function url(photo) {
  if (!photo?.kobo_url) return null;
  const mapped = photoMap[photo.kobo_url];
  if (mapped) return mapped;
  missingPhotos++;
  return CONFIG.useDummyPlaceholders ? PLACEHOLDER : null;
}

/** "Approved" / "Rejected" → pyrolysis_batch_status.status */
function reviewStatus(sheetStatus) {
  const s = (sheetStatus ?? '').toLowerCase();
  if (s.startsWith('approv')) return 'accepted';
  if (s.startsWith('reject')) return 'rejected';
  if (s.startsWith('hold')) return 'on_hold';
  return 'pending';
}

// ── pyrolysis ────────────────────────────────────────────────────────────────

const sessionRows = [];
const batchRows = [];
const statusRows = [];
const skipped = [];
/** batch_number (int) → pyrolysis_batches.id — used by mixing links below. */
const batchIdByNumber = new Map();

for (const p of rows) {
  const kontikkiId = refs.kontikki_id_by_code[p.kontikki_code];
  if (!kontikkiId) {
    skipped.push({ unique_code: p.unique_code, reason: `kontikki ${p.kontikki_code} unresolved` });
    tally('production rows SKIPPED');
    continue;
  }

  const sessionId = stableId('session', p.unique_code);
  const batchId = stableId('batch', p.unique_code);

  const startedAt = toIso(p.start) ?? toIso(p.batch_start_time);
  const completedAt = toIso(p.end) ?? toIso(p.batch_end_time);
  const lat = p.location?.lat ?? null;
  const lng = p.location?.lng ?? null;
  const meta = (capturedAt) =>
    photoMeta({ captured_at: capturedAt, lat, lng, address: p.cluster, source: 'kobotoolbox' });

  sessionRows.push({
    id: sessionId,
    operator_id: OPERATOR_ID,
    status: 'completed',
    current_step: 'complete',
    created_at: startedAt,
    completed_at: completedAt,
  });

  const feedstockKey = `${p.cluster}||${p.feedstock_type}`;
  const m = Object.fromEntries(p.moisture.map((x) => [x.index, x]));
  const endStageAt = combineDateTime(p.end ?? p.start, p.time_of_end_stage);

  batchRows.push({
    id: batchId,
    session_id: sessionId,
    kontikki_id: kontikkiId,
    kontikki_code: p.kontikki_code,
    batch_number: p.batch_number,

    feedstock_id: refs.feedstock_id_by_key[feedstockKey] ?? null,
    feedstock_name: p.feedstock_type,
    farm_id: null,
    farm_name: null,
    feedstock_quantity: null,
    avg_feedstock_size_cm: null,

    location_lat: lat,
    location_lng: lng,
    location_address: p.cluster,

    feedstock_photo_url: url(p.photos.feedstock),
    feedstock_photo_metadata: meta(startedAt),

    moisture_reading_1: m[1]?.reading ?? null,
    moisture_reading_2: m[2]?.reading ?? null,
    moisture_reading_3: m[3]?.reading ?? null,
    moisture_reading_4: m[4]?.reading ?? null,
    moisture_reading_5: m[5]?.reading ?? null,
    moisture_photo_url_1: url(m[1]),
    moisture_photo_url_2: url(m[2]),
    moisture_photo_url_3: url(m[3]),
    moisture_photo_url_4: url(m[4]),
    moisture_photo_url_5: url(m[5]),
    moisture_photo_metadata_1: m[1] ? meta(startedAt) : null,
    moisture_photo_metadata_2: m[2] ? meta(startedAt) : null,
    moisture_photo_metadata_3: m[3] ? meta(startedAt) : null,
    moisture_photo_metadata_4: m[4] ? meta(startedAt) : null,
    moisture_photo_metadata_5: m[5] ? meta(startedAt) : null,

    stage_initial_photo_url: url(p.photos.stage_initial),
    stage_middle_photo_url: url(p.photos.stage_middle),
    stage_final_photo_url: url(p.photos.stage_final),
    stage_quenching_photo_url: url(p.photos.stage_quenching),
    stage_initial_captured_at: startedAt,
    stage_middle_captured_at: startedAt,
    stage_final_captured_at: endStageAt,
    stage_quenching_captured_at: endStageAt,
    stage_initial_saved_at: startedAt,
    stage_middle_saved_at: startedAt,
    stage_final_saved_at: endStageAt,
    stage_quenching_saved_at: endStageAt,
    stage_initial_photo_metadata: meta(startedAt),
    stage_middle_photo_metadata: meta(startedAt),
    stage_final_photo_metadata: meta(endStageAt),
    stage_quenching_photo_metadata: meta(endStageAt),

    // "Biochar unloaded photo" has no dedicated column — parked on sample_*.
    sample_id: p.unique_code,
    sample_photo_url: url(p.photos.biochar_unloaded),
    sample_photo_metadata: meta(completedAt),
    sample_saved_at: completedAt,

    info_completed: true,
    moisture_completed: p.moisture.length > 0,
    pyrolysis_completed: true,
    info_saved_at: startedAt,
    moisture_saved_at: startedAt,
    pyrolysis_saved_at: completedAt,
    yield_saved_at: completedAt,
    yield_percent: p.yield_percent ?? null,

    comment: [
      `[${CONFIG.marker}] Kobo ${p.unique_code}`,
      p.remark,
      p.rejection_reason ? `Rejection: ${p.rejection_reason}` : null,
      p.flagged ? `Import flag: ${p.flag_reason}` : null,
    ]
      .filter(Boolean)
      .join(' | '),

    created_at: startedAt,
  });

  statusRows.push({
    id: stableId('batch_status', p.unique_code),
    batch_id: batchId,
    status: reviewStatus(p.status),
    reviewer_notes: `[${CONFIG.marker}] carried over from Kobo sheet ("${p.status ?? 'n/a'}")`,
    reviewed_by: null,
    reviewed_at: null,
  });

  const n = Number.parseInt(p.batch_number, 10);
  if (Number.isFinite(n)) batchIdByNumber.set(n, { id: batchId, kontikki_code: p.kontikki_code, unique_code: p.unique_code });
}

log(`Pyrolysis: ${batchRows.length} sessions + batches (${skipped.length} skipped)`);
if (missingPhotos) warn(`${missingPhotos} photo fields had no migrated URL — placeholder used`);

await upsert('pyrolysis_sessions', sessionRows);
await upsert('pyrolysis_batches', batchRows);
await upsert('pyrolysis_batch_status', statusRows, { onConflict: 'batch_id' });

// ── mixing ───────────────────────────────────────────────────────────────────
// Partial-range linking. Cited "1-10" with batch 3 absent → link 1,2,4..10.

const mixEntryRows = [];
const mixLinkRows = [];
const mixStatusRows = [];
const linkReport = [];

const producerNameByCluster = Object.fromEntries(
  Object.entries(CONFIG.producers).map(([c, v]) => [c, v.name]),
);

for (const mx of mixing) {
  const entryId = stableId('mixing', mx.kobo_uuid ?? mx.start);

  const cited = mx.batch_numbers ?? [];
  const resolved = [];
  const missing = [];
  for (const n of cited) {
    const hit = batchIdByNumber.get(n);
    if (hit) resolved.push({ n, ...hit });
    else missing.push(n);
  }

  linkReport.push({
    kobo_uuid: mx.kobo_uuid,
    farmer: mx.farmer_name,
    cited_range: mx.batch_no_raw,
    cited_count: cited.length,
    linked: resolved.map((r) => r.n),
    skipped_missing: missing,
  });

  if (!resolved.length && CONFIG.requireAtLeastOneLink) {
    warn(`mixing entry ${mx.farmer_name} (${mx.batch_no_raw}): none of ${cited.length} cited batches exist — entry still migrated, 0 links`);
    tally('mixing entries with ZERO links');
  }
  if (missing.length) tally('mixing batch refs skipped (not in sheet)', missing.length);
  tally('mixing batch refs linked', resolved.length);

  const startedAt = toIso(mx.date_of_mixing) ?? toIso(mx.start);

  mixEntryRows.push({
    id: entryId,
    operator_id: OPERATOR_ID,
    started_at: startedAt,
    farm_id: refs.farm_id_by_farmer[(mx.farmer_name ?? '').trim()] ?? null,
    farm_name: mx.farmer_name,
    location_lat: mx.location?.lat ?? null,
    location_lng: mx.location?.lng ?? null,
    location_address: [mx.site, mx.state].filter(Boolean).join(', ') || null,
    material_type: CONFIG.mixingDefaults.material_type,
    material_to_biochar_ratio: CONFIG.mixingDefaults.material_to_biochar_ratio,
    comment: [
      `[${CONFIG.marker}] Kobo ${mx.kobo_uuid}`,
      `Crop: ${mx.crop ?? 'n/a'}`,
      `Area: ${mx.area_acres ?? 'n/a'} acres`,
      `Cited batches: ${mx.batch_no_raw ?? 'n/a'}`,
      missing.length ? `Unavailable batches skipped: ${missing.join(',')}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
    biochar_photo_url: url(mx.photos.biochar),
    biochar_photo_metadata: photoMeta({
      captured_at: startedAt, lat: mx.location?.lat, lng: mx.location?.lng, address: mx.site,
    }),
    substrate_photo_url: url(mx.photos.compost),
    substrate_photo_metadata: photoMeta({
      captured_at: startedAt, lat: mx.location?.lat, lng: mx.location?.lng, address: mx.site,
    }),
    mixing_photo_url: url(mx.photos.final_mixture),
    mixing_photo_metadata: photoMeta({
      captured_at: startedAt, lat: mx.location?.lat, lng: mx.location?.lng, address: mx.site,
    }),
    status: 'submitted',
    created_at: toIso(mx.submission_time) ?? startedAt,
  });

  for (const r of resolved) {
    const cluster = CONFIG.kontikkiPrefixToCluster[(r.kontikki_code ?? '').replace(/[0-9].*$/, '')];
    mixLinkRows.push({
      mixing_entry_id: entryId,
      pyrolysis_batch_id: r.id,
      kontikki_code: r.kontikki_code,
      batch_number: String(r.n),
      producer_name: producerNameByCluster[cluster] ?? null,
    });
  }

  mixStatusRows.push({
    id: stableId('mixing_status', entryId),
    entry_id: entryId,
    status: 'pending_review',
    reviewer_notes: `[${CONFIG.marker}] migrated from Kobo`,
  });
}

const totalCited = linkReport.reduce((a, r) => a + r.cited_count, 0);
const totalLinked = linkReport.reduce((a, r) => a + r.linked.length, 0);
log(`Mixing: ${mixEntryRows.length} entries, ${totalLinked}/${totalCited} cited batches linked (${totalCited - totalLinked} skipped as absent)`);

await upsert('mixing_entries', mixEntryRows);
await upsert('mixing_pyrolysis_links', mixLinkRows, {
  onConflict: 'mixing_entry_id,pyrolysis_batch_id',
});
await upsert('mixing_entry_status', mixStatusRows, { onConflict: 'entry_id' });

// ── report ───────────────────────────────────────────────────────────────────

writeJson('migration-report.json', {
  generated_at: new Date().toISOString(),
  dry_run: DRY_RUN,
  marker: CONFIG.marker,
  pyrolysis: {
    attempted: rows.length,
    migrated: batchRows.length,
    skipped,
    photo_fields_without_migrated_url: missingPhotos,
  },
  mixing: {
    migrated: mixEntryRows.length,
    links_created: mixLinkRows.length,
    cited_total: totalCited,
    per_entry: linkReport,
  },
});

printTally();
log(DRY_RUN ? '\nDry run complete. Re-run with --apply to write.\n' : '\nStep 3 done. Next: 04-verify.mjs\n');
