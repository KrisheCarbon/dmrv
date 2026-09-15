/**
 * All tunable / real values for the Parkal + Griffith → Supabase migration.
 * Edit this file; the scripts read from it. Nothing else needs changing.
 *
 * SCOPE: this run migrates ONLY the "Parkal" cluster from
 * Final_sheet_data_migration.xlsx (93 production entries, 16 mixing entries,
 * kontikkis PP001–PP010 + GF001–GF006). The other 5 clusters (Akola,
 * Dhrangivas, Rani Umbri, Wardha, Yavatmal) are out of scope for this run.
 *
 * This is REAL production/mixing data, not test data. No "(test data)"
 * labels, no MIGRATION-TEST marker — see `marker` below.
 *
 * SITE MODEL (decision from chat): ONE biochar_producers row ("Parkal"),
 * TWO producer_sites rows ("Parkal" + "Griffith") underneath it. Every kiln's
 * `biochar_producer_id` points at the single producer — `producers` below is
 * only a cluster→display-name map used for the denormalised producer_name
 * text field on mixing_pyrolysis_links, it does not create a second producer.
 */

export const CONFIG = {
  // ── Behaviour ──────────────────────────────────────────────────────────────

  /** Migrate every Parkal/Griffith row, including the 80 flagged as blocked
   *  by the earlier Kobo import attempt (missing kiln / missing feedstock —
   *  both are being created below, so they're no longer actually blocked). */
  includeFlagged: true,

  /**
   * Mixing → pyrolysis linking. A mixing entry cites a batch-number range like
   * "84-93". We link every batch in that range that exists in the DB and
   * silently skip the ones that don't (batches 14–43 are cited by one entry
   * but were never in the production data — genuinely missing source data),
   * rather than failing the whole entry.
   */
  linkPartialBatchRanges: true,
  /** Fail a mixing entry only if NONE of its cited batches resolved. */
  requireAtLeastOneLink: true,

  /**
   * Every row this migration creates/touches is stamped so it can be found
   * later if something needs correcting. This is real data, so the marker is
   * informational (in `comment` fields), not a "delete me" flag.
   */
  marker: 'MIGRATED-PARKAL-2026-08',

  // ── Operator ───────────────────────────────────────────────────────────────

  /**
   * users.id that migrated sessions / batches / mixing entries are attributed
   * to. Decision: reuse an existing user (tanisha singh, climapreneur) —
   * not a new bot user.
   */
  operatorUserId: '696e4639-30a6-4de5-8c0a-2a930912a3aa', // tanisha singh <tanisha.singh@krishecarbon.com>
  operatorSeed: null, // unused while operatorUserId is set

  // ── Producer + sites ─────────────────────────────────────────────────────
  // Decision: ONE producer ("Parkal"), TWO sites (Parkal, Griffith) — not two
  // separate producers.

  producer: {
    name: 'Parkal',
    producer_class: 'artisan_pro',
    status: 'active',
    operation_model: 'hub',
    // Weighted average of all 93 batch GPS points (Parkal + Griffith combined).
    producer_location: {
      lat: 18.201628,
      lng: 79.686232,
      place_name: 'Parkal, Telangana',
      address: 'Parkal, Telangana, India',
      source: 'migration-derived-from-batch-gps',
    },
    // Not present in the sheet. Left null — fill in via the dashboard once
    // real contact details are available. DB allows null; only the web
    // portal's "create producer" form requires it, and this migration writes
    // directly to the DB (service role), bypassing that form.
    contact_name: null,
    email: null,
    mobile_number: null,
    is_from_krishe: true,
    is_individual_contributor: false,
  },

  sites: {
    Parkal: {
      site_name: 'Parkal',
      site_location: {
        lat: 18.221798, // avg of PP001–PP010 batch GPS
        lng: 79.681847,
        place_name: 'Parkal, Telangana',
        address: 'Parkal, Telangana, India',
        source: 'migration-derived-from-batch-gps',
      },
      site_manager_name: null,
      site_manager_email: null,
      site_manager_mobile: null,
    },
    Griffith: {
      site_name: 'Griffith',
      site_location: {
        lat: 18.175486, // avg of GF001–GF006 batch GPS
        lng: 79.671235,
        place_name: 'Griffith, Telangana',
        address: 'Griffith cluster, Telangana, India',
        source: 'migration-derived-from-batch-gps',
      },
      site_manager_name: null,
      site_manager_email: null,
      site_manager_mobile: null,
    },
  },

  /**
   * Cluster/site display-name map, keyed the same way as production_entries
   * .json's `cluster` field ("Parkal" / "Griffith"). Used only for the
   * denormalised `producer_name` text column on mixing_pyrolysis_links — both
   * resolve to the SAME biochar_producer_id under the hood (see `producer`
   * above), this just keeps the Parkal/Griffith distinction visible in the UI.
   */
  producers: {
    Parkal: { name: 'Parkal' },
    Griffith: { name: 'Griffith' },
  },

  /** Kontikki code prefix → cluster/site label. PP001–PP010, GF001–GF006. */
  kontikkiPrefixToCluster: { PP: 'Parkal', GF: 'Griffith' },

  // ── Kontikki dimensions ──────────────────────────────────────────────────
  // Real measurements provided for all 16 Parkal/Griffith kilns (uniform
  // across both sites — same kiln design).
  //
  // capacity is derived, not hand-typed: V = (π·h/3)·(R² + R·r + r²), same
  // truncated-cone formula verified against the live kc002 row
  // (150/90/90 → 1039.081770174824). For 150/82.3/92 this gives ≈1002.4 L.

  kontikkiDefaults: {
    status: 'active',
    top_diameter_cm: 150,
    bottom_diameter_cm: 82.3,
    depth_cm: 92,
    module_id: null, // no ESP32 hardware bound to these kilns
  },

  // ── Feedstock / lab-report values ────────────────────────────────────────
  // Real lab results (Kalp Climate / Enviro Analysts & Engineers Pvt Ltd lab
  // reports), one row per biomass type, attached to the "Parkal" producer.
  // All three pass the app's validation bounds (density 100–700, carbon
  // 0–100%, hc_ratio < 0.4).
  //
  // lab_submission_date = "Date of received" and lab_analysis_date =
  // "Date of Analysis Completion", both read directly off the actual PDF
  // reports (Cotton's analysis-completion date wasn't in the dashboard view
  // but is on the PDF: 06.06.2026). lab_report_local_path points at the PDF
  // on disk — 01-create-refs.mjs uploads it as-is to the feedstocks bucket.

  feedstockDefaults: {
    methane_compensation_strategy: 'offsetting_from_scp_fraction',
    biomass_preparation_instruction: null,
  },
  /** Per biomass type, for the "Parkal" producer. Source: Kalp Climate lab reports. */
  feedstockByType: {
    'Corn Cobs': {
      identifier: 'FS-34',
      biochar_bulk_density_kg_m3: 328.0,
      carbon_content_percent: 88.24,
      hc_ratio: 0.33,
      lab_status: 'analysis_completed',
      lab_submission_date: '2026-05-16', // Date of received (report OT/BIOCHAR/16-05/05/26)
      lab_analysis_date: '2026-05-25', // Date of Analysis Completion
      lab_report_local_path: 'Kalp_Climate_-_Biochar__16-05_-_MAY_26.pdf', // relative to repo root
    },
    Chilli: {
      identifier: 'FS-37',
      biochar_bulk_density_kg_m3: 241.42,
      carbon_content_percent: 72.61,
      hc_ratio: 0.29,
      lab_status: 'analysis_completed',
      lab_submission_date: '2026-04-23', // Date of received (report OT/BIOCHAR/23-13/04/26)
      lab_analysis_date: '2026-04-29', // Date of Analysis Completion
      lab_report_local_path: 'Chilli_Kalp_Climate_-_Biochar__23-13_-_APR_26.pdf', // relative to repo root
    },
    Cotton: {
      identifier: 'FS-38',
      biochar_bulk_density_kg_m3: 184.0,
      carbon_content_percent: 76.45,
      hc_ratio: 0.24,
      lab_status: 'analysis_completed',
      lab_submission_date: '2026-06-01', // Date of received (report OT/BIOCHAR/01-13/06/26)
      lab_analysis_date: '2026-06-06', // Date of Analysis Completion (was "-" in dashboard, present on PDF)
      lab_report_local_path: 'Kalp_Climate_-_Biochar__01-13_-_June_26.pdf', // relative to repo root
    },
  },

  // ── Mixing entry defaults ──────────────────────────────────────────────────
  // Not present in the Kobo mixing form for Parkal — no right answer to
  // recover, so these stay as clearly-labeled defaults pending confirmation.

  mixingDefaults: {
    material_type: 'biological_matrix_compost',
    material_to_biochar_ratio: 3,
  },

  /** farms.estimated_biomass is NOT NULL. Rough tonnes/acre by crop. */
  farmDefaults: {
    estimated_biomass_per_acre: { Cotton: 2, Chilli: 1.5, Corn: 2.5, 'Corn Cobs': 2.5 },
    estimated_biomass_fallback: 2,
  },

  // ── Photos ─────────────────────────────────────────────────────────────────

  kobo: {
    baseUrl: 'https://kf.kobotoolbox.org',
    /** Set KOBO_API_TOKEN in Backend/.env. Header: `Authorization: Token <key>`. */
    tokenEnvVar: 'KOBO_API_TOKEN',
    concurrency: 4,
    retries: 3,
    /** Cache downloads on disk so re-runs don't re-hit Kobo. */
    cacheDir: 'photos',
  },

  /**
   * When a Kobo attachment is missing / 403s, or a field the schema wants has
   * no photo at all (kontikki top/side photos, kiln plan PDF, feedstock lab
   * report), upload a generated placeholder instead of leaving it null.
   */
  useDummyPlaceholders: true,

  // Real buckets on the live project (all of them are private — `public: false`,
  // including `mixing`, despite what migration 009 declares). Mobile's upload
  // helpers call getPublicUrl() regardless, so migrated rows store the same
  // public-format URL shape as existing rows. 04-verify --check-urls will
  // report them as unreachable anonymously; that is expected, not a migration
  // bug, and matches how the app already behaves.
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
