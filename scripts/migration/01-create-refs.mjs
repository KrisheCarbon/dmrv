#!/usr/bin/env node
/**
 * STEP 1 — Reference records: producer, sites, kontikkis, feedstocks, farms.
 *
 * Dry run by default. Add --apply to write.
 *
 *   node scripts/migration/01-create-refs.mjs
 *   node scripts/migration/01-create-refs.mjs --apply
 *
 * Which org this runs for is picked with --org=<name> (default "parkal"),
 * matching a file in ./configs/<name>.mjs. Each org gets its own data
 * directory (./data/<name>/) so runs never collide.
 *
 *   node scripts/migration/01-create-refs.mjs --org=akrsp
 *
 * Output: data/<org>/ref-map.json — consumed by 02-migrate-photos.mjs,
 * 03-migrate-entries.mjs and 04-verify.mjs. Shape:
 *   {
 *     operator_id,
 *     kontikki_id_by_code:   { "PP001": "<uuid>", ... },
 *     feedstock_id_by_key:   { "Parkal||Cotton": "<uuid>", "Griffith||Cotton": "<uuid>", ... },
 *     farm_id_by_farmer:     { "<exact farmer_name>": "<uuid>", ... },
 *     placeholder_image_url,
 *     producer_id, site_id_by_cluster   (informational, not read by later steps)
 *   }
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROOT,
  ORG,
  banner,
  log,
  warn,
  fail,
  requireSupabase,
  stableId,
  select,
  upsert,
  uploadObject,
  readJson,
  writeJson,
  printTally,
  tally,
  loadConfig,
} from './lib/common.mjs';

const CONFIG = await loadConfig();
import { dummyImageUrl, dummyPdfUrl } from './lib/placeholders.mjs';

requireSupabase();

const productionEntries = readJson('production_entries.json');
const mixingEntries = readJson('mixing_entries.json');

function truncatedConeCapacityLitres(topDiaCm, bottomDiaCm, depthCm) {
  const R = topDiaCm / 2;
  const r = bottomDiaCm / 2;
  const h = depthCm;
  const volCm3 = ((Math.PI * h) / 3) * (R * R + R * r + r * r);
  return volCm3 / 1000;
}

async function ensureOperator() {
  if (!CONFIG.operatorUserId) {
    fail('CONFIG.operatorUserId is not set and no bot-user creation path is configured for this run.');
  }
  const rows = await select('users', `select=id,full_name,email,role,status&id=eq.${CONFIG.operatorUserId}`);
  if (!rows.length) {
    fail(`operatorUserId ${CONFIG.operatorUserId} not found in users table.`);
  }
  const u = rows[0];
  log(`Operator: ${u.full_name} <${u.email}> (${u.role}, ${u.status})`);
  if (u.status !== 'active') {
    warn(`Operator status is "${u.status}", not "active".`);
  }
  return u.id;
}

async function ensureProducer() {
  const id = stableId('producer', CONFIG.producer.name);
  const row = {
    id,
    producer_code: `BP-${CONFIG.producer.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`,
    name: CONFIG.producer.name,
    producer_class: CONFIG.producer.producer_class,
    status: CONFIG.producer.status,
    producer_location: CONFIG.producer.producer_location,
    contact_name: CONFIG.producer.contact_name,
    email: CONFIG.producer.email,
    mobile_number: CONFIG.producer.mobile_number,
    operation_model: CONFIG.producer.operation_model,
    partner_organization_id: null,
    is_individual_contributor: CONFIG.producer.is_individual_contributor,
    is_from_krishe: CONFIG.producer.is_from_krishe,
    other_document_urls: [],
  };
  await upsert('biochar_producers', row, { onConflict: 'id' });
  log(`Producer "${CONFIG.producer.name}" -> ${id}`);
  return id;
}

async function ensureSites(producerId) {
  const siteIdByCluster = {};
  for (const [siteKey, site] of Object.entries(CONFIG.sites)) {
    const id = stableId('site', `${CONFIG.producer.name}:${siteKey}`);
    const row = {
      id,
      biochar_producer_id: producerId,
      site_name: site.site_name,
      site_model: CONFIG.producer.operation_model,
      site_location: site.site_location,
      partner_organization_id: null,
      is_individual_contributor: CONFIG.producer.is_individual_contributor,
      is_from_krishe: CONFIG.producer.is_from_krishe,
      site_manager_name: site.site_manager_name,
      site_manager_email: site.site_manager_email,
      site_manager_mobile: site.site_manager_mobile,
    };
    await upsert('producer_sites', row, { onConflict: 'id' });
    log(`  Site "${site.site_name}" -> ${id}`);
    siteIdByCluster[siteKey] = id;
  }
  return siteIdByCluster;
}

async function ensureKontikkis(producerId, operatorId) {
  const codes = new Set(productionEntries.map((e) => e.kontikki_code));
  const kontikkiIdByCode = {};
  const { top_diameter_cm, bottom_diameter_cm, depth_cm } = CONFIG.kontikkiDefaults;
  const capacity = truncatedConeCapacityLitres(top_diameter_cm, bottom_diameter_cm, depth_cm);

  const topPhotoUrl = await dummyImageUrl(CONFIG.buckets.kontikkis);
  const bottomPhotoUrl = await dummyImageUrl(CONFIG.buckets.kontikkis);
  const planPdfUrl = await dummyPdfUrl(CONFIG.buckets.kontikkis);

  for (const code of [...codes].sort()) {
    const prefix = code.replace(/[0-9].*$/, '');
    const cluster = CONFIG.kontikkiPrefixToCluster[prefix];
    if (!cluster) {
      warn(`Kontikki ${code}: no cluster mapping for prefix "${prefix}" — skipping.`);
      continue;
    }
    const id = stableId('kontikki', code);
    const row = {
      id,
      kontikki_code: code,
      status: CONFIG.kontikkiDefaults.status,
      biochar_producer_id: producerId,
      top_diameter_cm,
      bottom_diameter_cm,
      depth_cm,
      capacity,
      top_photo_url: topPhotoUrl,
      side_photo_url: bottomPhotoUrl,
      top_photo_urls: [topPhotoUrl],
      bottom_photo_urls: [bottomPhotoUrl],
      plan_pdf_url: planPdfUrl,
      module_id: CONFIG.kontikkiDefaults.module_id,
    };
    await upsert('kontikkis', row, { onConflict: 'id' });
    await upsert(
      'kontikki_operators',
      { kontikki_id: id, operator_id: operatorId },
      { onConflict: 'kontikki_id,operator_id' },
    );
    kontikkiIdByCode[code] = id;
    tally('kontikkis upserted');
  }
  log(`Kontikkis: ${Object.keys(kontikkiIdByCode).length} (capacity ${capacity.toFixed(2)} L each)`);
  return kontikkiIdByCode;
}

async function ensureFeedstocks(producerId, operatorId) {
  const types = new Set(productionEntries.map((e) => e.feedstock_type).filter(Boolean));
  const clusters = new Set(productionEntries.map((e) => e.cluster).filter(Boolean));
  const idByType = {};
  const feedstockIdByKey = {};

  for (const type of types) {
    const cfg = CONFIG.feedstockByType[type];
    if (!cfg) {
      warn(`Feedstock type "${type}" has no config entry in feedstockByType — skipping.`);
      continue;
    }
    if (cfg.hc_ratio >= 0.4) {
      fail(`Feedstock "${type}": hc_ratio ${cfg.hc_ratio} violates app rule (must be < 0.4).`);
    }
    if (cfg.biochar_bulk_density_kg_m3 < 100 || cfg.biochar_bulk_density_kg_m3 > 700) {
      fail(`Feedstock "${type}": bulk density ${cfg.biochar_bulk_density_kg_m3} out of [100,700].`);
    }

    let labReportDocUrl = null;
    if (cfg.lab_report_local_path) {
      const abs = resolve(ROOT, cfg.lab_report_local_path);
      if (existsSync(abs)) {
        const bytes = readFileSync(abs);
        labReportDocUrl = await uploadObject(
          CONFIG.buckets.feedstocks,
          `${type.toLowerCase().replace(/\s+/g, '-')}/lab-report.pdf`,
          bytes,
          'application/pdf',
        );
      } else {
        warn(`Feedstock "${type}": lab report PDF not found at ${abs} — leaving lab_report_doc_url null.`);
      }
    }

    const id = stableId('feedstock', `${CONFIG.producer.name}:${type}`);
    const row = {
      id,
      biomass_type: type,
      biochar_producer_id: producerId,
      biochar_bulk_density_kg_m3: cfg.biochar_bulk_density_kg_m3,
      carbon_content_percent: cfg.carbon_content_percent,
      hc_ratio: cfg.hc_ratio,
      lab_status: cfg.lab_status,
      lab_submission_date: cfg.lab_submission_date,
      lab_analysis_date: cfg.lab_analysis_date,
      biomass_preparation_instruction: CONFIG.feedstockDefaults.biomass_preparation_instruction,
      methane_compensation_strategy: CONFIG.feedstockDefaults.methane_compensation_strategy,
      lab_report_doc_url: labReportDocUrl,
      lab_report_image_url: null,
      ghg_avoidance_approval_doc_url: null,
      ghg_avoidance_approval_image_url: null,
      created_by: operatorId,
      updated_at: new Date().toISOString(),
    };
    await upsert('feedstocks', row, { onConflict: 'id' });
    idByType[type] = id;
    log(
      `  Feedstock "${type}" (${cfg.identifier ?? 'no id'}) -> ${id}` +
        (labReportDocUrl ? ` [lab report uploaded: ${labReportDocUrl}]` : ' [no lab report uploaded]'),
    );
  }

  // One producer, but production_entries.json still tags each row with its
  // sub-site ("Parkal" or "Griffith") in `cluster` — 03-migrate-entries.mjs
  // looks feedstocks up by `${cluster}||${type}`, so both sites' keys point
  // at the same underlying feedstock id.
  for (const cluster of clusters) {
    for (const [type, id] of Object.entries(idByType)) {
      feedstockIdByKey[`${cluster}||${type}`] = id;
    }
  }

  return feedstockIdByKey;
}

function normalizeName(name) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function ensureFarms(operatorId) {
  const existing = await select('farms', 'select=id,farmer_name');
  const existingByName = new Map(existing.map((f) => [normalizeName(f.farmer_name), f.id]));

  const byName = new Map();
  for (const m of mixingEntries) {
    if (!m.farmer_name) continue;
    const key = normalizeName(m.farmer_name);
    const list = byName.get(key) ?? [];
    list.push(m);
    byName.set(key, list);
  }

  /** Keyed by the EXACT (trimmed, original-case) farmer_name — matches how
   *  03-migrate-entries.mjs looks this map up. */
  const farmIdByFarmer = {};

  for (const [key, entries] of byName) {
    const displayName = entries[0].farmer_name.trim();
    const reused = existingByName.get(key);

    if (reused) {
      farmIdByFarmer[displayName] = reused;
      log(`  Farm "${displayName}" -> reusing existing ${reused}`);
      tally('farms reused (existing DB match)');
      continue;
    }

    const first = entries[0];
    const crops = entries.map((m) => ({
      crop: m.crop ?? null,
      area_acres: m.area_acres ?? null,
      mixing_date: m.date_of_mixing ?? null,
    }));
    const perAcre =
      CONFIG.farmDefaults.estimated_biomass_per_acre[first.crop] ??
      CONFIG.farmDefaults.estimated_biomass_fallback;
    const totalAcres = entries.reduce((sum, m) => sum + (m.area_acres ?? 0), 0);

    const id = stableId('farm', key);
    const phoneDigits = (first.phone ?? '').replace(/\D/g, '').slice(-10);
    const row = {
      id,
      farmer_name: displayName,
      mobile_number: phoneDigits || null,
      latitude: first.location?.lat ?? null,
      longitude: first.location?.lng ?? null,
      address: `${first.site ?? 'Parkal'}, Telangana`,
      total_land_size: totalAcres || null,
      crops,
      interested_in_biochar: true,
      prior_biochar_exp: false,
      estimated_biomass: Math.round(totalAcres * perAcre * 100) / 100,
      created_by: operatorId,
      assigned_to: operatorId,
    };

    if (phoneDigits && phoneDigits.length < 10) {
      warn(
        `Farm "${displayName}": phone "${first.phone}" only has ${phoneDigits.length} digits — verify before relying on it.`,
      );
    }

    await upsert('farms', row, { onConflict: 'id' });
    farmIdByFarmer[displayName] = id;
    tally('farms created (new)');
  }

  return farmIdByFarmer;
}

async function main() {
  banner(`01 [${ORG}] — Create reference records (producer, sites, kontikkis, feedstocks, farms)`);

  const operatorId = await ensureOperator();
  const producerId = await ensureProducer();
  const siteIdByCluster = await ensureSites(producerId);
  const kontikkiIdByCode = await ensureKontikkis(producerId, operatorId);
  const feedstockIdByKey = await ensureFeedstocks(producerId, operatorId);
  const farmIdByFarmer = await ensureFarms(operatorId);
  const placeholderImageUrl = await dummyImageUrl(CONFIG.buckets.pyrolysis);

  writeJson('ref-map.json', {
    generated_at: new Date().toISOString(),
    operator_id: operatorId,
    producer_id: producerId,
    site_id_by_cluster: siteIdByCluster,
    kontikki_id_by_code: kontikkiIdByCode,
    feedstock_id_by_key: feedstockIdByKey,
    farm_id_by_farmer: farmIdByFarmer,
    placeholder_image_url: placeholderImageUrl,
  });

  printTally();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
