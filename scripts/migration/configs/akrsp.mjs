/**
 * All tunable / real values for the AKRSP → Supabase migration.
 * Edit this file; the scripts read from it. Nothing else needs changing.
 *
 * SCOPE: migrates the "AKRSP" data from AKRSP_data.xlsx — 19 production
 * batches across 3 kilns (AK001–AK003) and 4 mixing entries, all in one
 * village ("Barukhodra", Madhya Pradesh). Kobo source: "AKRSP Madhya
 * Pradesh" (production) + "AKRSP Biochar mixing" (mixing) — both confirmed
 * reachable with the existing KOBO_API_TOKEN.
 *
 * This is REAL production/mixing data, not test data.
 *
 * SITE MODEL: ONE biochar_producers row ("AKRSP"), ONE producer_sites row
 * ("Barukhodra") underneath it — decided in chat (the sheet only ever
 * mentions this one village).
 *
 * ⚠️ LAB REPORT CAVEAT (flagged explicitly, per chat): AKRSP.pdf is
 * byte-identical to the Parkal Corn Cobs report (same customer — "Kalp
 * Climate Tech Private Limited" — same report number OT/BIOCHAR/16-05/05/26).
 * It is NOT an AKRSP-specific Cotton lab report. Per explicit instruction
 * ("use this for akrsp too") the numbers on that PDF are stored on AKRSP's
 * Cotton feedstock anyway, but lab_status is set to "estimated" (not
 * "analysis_completed") because these values were never actually measured
 * for AKRSP's cotton biochar — replace with a real test result when
 * available.
 */

export const CONFIG = {
  // ── Behaviour ──────────────────────────────────────────────────────────────

  includeFlagged: true,
  linkPartialBatchRanges: true,
  requireAtLeastOneLink: true,
  marker: 'MIGRATED-AKRSP-2026-08',

  // ── Operator ───────────────────────────────────────────────────────────────

  operatorUserId: '696e4639-30a6-4de5-8c0a-2a930912a3aa', // tanisha singh <tanisha.singh@krishecarbon.com> — same as Parkal, per chat
  operatorSeed: null,

  // ── Producer + site ───────────────────────────────────────────────────────

  producer: {
    name: 'AKRSP',
    producer_class: 'artisan_pro',
    status: 'active',
    operation_model: 'hub',
    producer_location: {
      lat: 21.860895,
      lng: 74.89058,
      place_name: 'Barukhodra, Madhya Pradesh',
      address: 'Barukhodra, Madhya Pradesh, India',
      source: 'migration-derived-from-batch-gps',
    },
    contact_name: null,
    email: null,
    mobile_number: null,
    is_from_krishe: true,
    is_individual_contributor: false,
  },

  sites: {
    Barukhodra: {
      site_name: 'Barukhodra',
      site_location: {
        lat: 21.860895,
        lng: 74.89058,
        place_name: 'Barukhodra, Madhya Pradesh',
        address: 'Barukhodra, Madhya Pradesh, India',
        source: 'migration-derived-from-batch-gps',
      },
      site_manager_name: null,
      site_manager_email: null,
      site_manager_mobile: null,
    },
  },

  /** Cluster/site display-name map (see 01-create-refs.mjs's usage). Only one here. */
  producers: {
    Barukhodra: { name: 'AKRSP' },
  },

  /** Kontikki code prefix → cluster/site label. AK001–AK003. */
  kontikkiPrefixToCluster: { AK: 'Barukhodra' },

  // ── Kontikki dimensions ──────────────────────────────────────────────────
  // Not in the sheet. Decision: reuse the same real Parkal measurements
  // (150/82.3/92 cm) as a stand-in until AKRSP's actual kiln dimensions are
  // provided.

  kontikkiDefaults: {
    status: 'active',
    top_diameter_cm: 150,
    bottom_diameter_cm: 82.3,
    depth_cm: 92,
    module_id: null,
  },

  // ── Feedstock / lab-report values ────────────────────────────────────────

  feedstockDefaults: {
    methane_compensation_strategy: 'offsetting_from_scp_fraction',
    biomass_preparation_instruction: null,
  },
  feedstockByType: {
    Cotton: {
      identifier: null,
      biochar_bulk_density_kg_m3: 328.0,
      carbon_content_percent: 88.24,
      hc_ratio: 0.33,
      // "estimated", not "analysis_completed" — see the file-level caveat above.
      lab_status: 'estimated',
      lab_submission_date: '2026-05-16',
      lab_analysis_date: '2026-05-25',
      lab_report_local_path: 'AKRSP.pdf', // same bytes as the Parkal Corn Cobs report — reused per explicit instruction
    },
  },

  // ── Mixing entry defaults ──────────────────────────────────────────────────

  mixingDefaults: {
    material_type: 'biological_matrix_compost',
    material_to_biochar_ratio: 3,
  },

  farmDefaults: {
    estimated_biomass_per_acre: { Cotton: 2 },
    estimated_biomass_fallback: 2,
  },

  // ── Photos ─────────────────────────────────────────────────────────────────

  kobo: {
    baseUrl: 'https://kf.kobotoolbox.org',
    tokenEnvVar: 'KOBO_API_TOKEN',
    concurrency: 4,
    retries: 3,
    cacheDir: 'photos',
  },

  useDummyPlaceholders: true,

  buckets: {
    pyrolysis: 'pyrolysis',
    mixing: 'mixing',
    kontikkis: 'kontikkis',
    feedstocks: 'feedstocks',
    farms: 'farms',
    producers: 'biochar-producers',
  },
};

export default CONFIG;
