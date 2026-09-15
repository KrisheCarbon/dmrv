# Kobo → Portal Data Migration — Requirements Checklist

**Purpose:** move the existing Kobo dataset (93 pyrolysis entries, 16 mixing entries, ~1,100 photos) into the live Supabase DB so the dashboard flow can be tested end to end.

**Legend**

| Mark | Meaning |
|:--:|---|
| 🤖 | Script does it automatically — nothing to do |
| ✋ | Script does it, but **you must supply a value first** (in `config.mjs`) |
| 👤 | Manual step — a human has to do it |
| 🅼 | Mandatory (DB rejects the row without it) |
| 🅞 | Optional (nice to have, row saves without it) |

**Golden rule:** the Kobo submissions are the only copy of this data. Every script only ever *reads* from Kobo. Nothing gets deleted anywhere, in Kobo or in Supabase.

---

## The dependency chain

Things must be created in this order. Each one is a foreign key for the next.

```
  Operator user
       ↓
  Biochar Producer  ──→  Producer Site
       ↓
  Kontikki (kiln)          Feedstock
       ↓                        ↓
  Pyrolysis Session  ──→  Pyrolysis Batch  ──→  Batch Review Status
                                ↓
                          Mixing Link  ←──  Mixing Entry  ←──  Farm
                                                 ↓
                                          Mixing Review Status
```

If a kiln doesn't exist, its batches can't be created. If a batch doesn't exist, a mixing entry can't link to it. That's the whole reason 80 rows failed the earlier import attempt.

---

# PRE-FLIGHT — before running anything

### R0.1 — Credentials 👤

| Item | Where it goes | Status |
|---|---|:--:|
| `SUPABASE_URL` | `Backend/.env` | ✅ already present |
| `SUPABASE_SERVICE_ROLE_KEY` | `Backend/.env` | ✅ already present |
| `KOBO_API_TOKEN` | `Backend/.env` — **you must add this** | ❌ **BLOCKER** |

Get the Kobo token: `kf.kobotoolbox.org` → Account Settings → Security → API Key.
Confirm the account can read asset `aSRWMPDhGPUs4XqCvd6SYN` (production form) and the mixing form.

### R0.2 — Snapshot the DB before touching it 👤

```bash
node scripts/migration/00-inspect-db.mjs     # read-only, already run
```

Keep `data/db-snapshot.json`. It is your "before" picture and your rollback reference. **Do not commit it** — it contains real staff emails.

### R0.3 — Every script runs dry first 🤖

No script writes anything unless you pass `--apply`. Always run without the flag, read the output, then re-run with it.

---

# REQUIREMENT 1 — Operator user

Every session, batch and mixing entry must be attributed to a user. Without one, nothing else can be inserted.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `id` | 🅼 | auth.users (created via admin API) | 🤖 |
| `email` | 🅼 | `config.operatorSeed.email` | ✋ |
| `phone` | 🅼 | `config.operatorSeed.phone` (dummy `9000000000`) | ✋ |
| `role` | 🅼 | `climapreneur` | 🤖 |
| `first_name` | 🅼 | `Migration` | ✋ |
| `last_name` | 🅼 | `Bot` | ✋ |
| `status` | 🅼 | `active` | 🤖 |
| `middle_name`, `full_name`, `created_by` | 🅞 | — | 🤖 |

**Decision to make:** create a new bot user, or reuse an existing one? Setting `config.operatorUserId` to an existing UUID reuses it. There are 10 real users already in the DB — reusing one means test data appears under a real person's name, which is harder to clean up later. **Recommend the bot user.**

---

# REQUIREMENT 2 — Biochar Producers

The sheet has two clusters: **Parkal** (74 entries) and **Griffith** (19). Each becomes one producer.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `producer_code` | 🅼 | auto-generated `BP-XXXXXXXX` | 🤖 |
| `name` | 🅼 | `config.producers.<cluster>.name` | ✋ |
| `producer_class` | 🅼 | `artisan_pro` | ✋ |
| `status` | 🅼 | `active` | 🤖 |
| `is_individual_contributor` | 🅼 | `false` | ✋ |
| `is_from_krishe` | 🅼 | `true` | ✋ |
| `other_document_urls` | 🅼 | `[]` (empty array is fine) | 🤖 |
| `operation_model` | 🅞 | `hub` | ✋ |
| `producer_location` | 🅞 | real lat/lng from the sheet | ✋ |
| `contact_name`, `email`, `mobile_number` | 🅞 | dummy values | ✋ |
| `contract_url`, `training_cert_url` | 🅞 | placeholder PDF | 🤖 |
| `registry_producer_id`, `partner_organization_id` | 🅞 | null | 🤖 |

**Not in the Kobo data:** everything except cluster name and location. All of it is dummy.

---

# REQUIREMENT 3 — Producer Sites

One site per producer. This is the "site" the dashboard groups kilns under.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `biochar_producer_id` | 🅼 | R2 above | 🤖 |
| `site_model` | 🅼 | `hub` | ✋ |
| `is_individual_contributor` | 🅼 | `false` | ✋ |
| `is_from_krishe` | 🅼 | `true` | ✋ |
| `site_name` | 🅞 | `config.producers.<cluster>.site.site_name` | ✋ |
| `site_location` | 🅞 | cluster lat/lng | ✋ |
| `site_manager_name` / `_email` / `_mobile` | 🅞 | dummy values | ✋ |

---

# REQUIREMENT 4 — Kontikkis (kilns) ⚠️ THE BIG ONE

16 kilns are referenced: **PP001–PP010** and **GF001–GF006**. Only **2 kilns exist in the DB today** (`kc001`, `kc002`) and neither is one of these. So **all 16 have to be created.**

This was the #1 cause of the earlier import failure — "Kiln PP005 not registered" etc.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `kontikki_code` | 🅼 | sheet column "Kon Tiki Name" | 🤖 |
| `status` | 🅼 | `active` | 🤖 |
| `top_photo_urls` | 🅼 | placeholder image (array) | 🤖 |
| `bottom_photo_urls` | 🅼 | placeholder image (array) | 🤖 |
| `biochar_producer_id` | 🅞 | derived from code prefix: `PP`→Parkal, `GF`→Griffith | 🤖 |
| `top_diameter_cm` | 🅞 | **dummy 220** | ✋ |
| `bottom_diameter_cm` | 🅞 | **dummy 90** | ✋ |
| `depth_cm` | 🅞 | **dummy 90** | ✋ |
| `capacity` | 🅞 | **calculated**, not guessed — see below | 🤖 |
| `top_photo_url`, `side_photo_url`, `plan_pdf_url` | 🅞 | placeholders | 🤖 |
| `module_id` | 🅞 | null (no ESP32 hardware on test kilns) | 🤖 |
| `kp_number` | 🅞 | null | 🤖 |

**About `capacity` — explain this one to the junior, it's the subtle bit.**
The existing rows store capacity in **litres**, computed as a truncated-cone volume:

> V = (π · h / 3) · (R² + R·r + r²)

Verified against the live row `kc002` (150 / 90 / 90 cm → 1039.081770174824). The script uses the same formula so migrated kilns are consistent with the two real ones. If you change the dummy dimensions, capacity recalculates automatically — don't hand-type it.

**⚠️ Action needed:** the dummy dimensions are a guess. If real measurements for PP001–PP010 / GF001–GF006 exist anywhere, put them in `config.kontikkiDefaults` (or extend it per-kiln) before running. Carbon calculations downstream depend on kiln volume.

Also created: a `kontikki_operators` row linking each kiln to the migration operator, so batches are attributable. 🤖

---

# REQUIREMENT 5 — Feedstocks (lab reports) ⚠️ SECOND BIG ONE

Three biomass types appear: **Corn Cobs** (13 entries), **Cotton** (34), **Chilli** (46). Only **1 feedstock exists in the DB** (`cotton`, still `waiting_for_results`).

"No lab report for Cotton/Chilli feedstock" blocked ~75 of the 80 failed rows.

One row is created per **biomass type × producer**.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `biomass_type` | 🅼 | sheet column "Feedstock Type" | 🤖 |
| `biochar_producer_id` | 🅼 | R2 | 🤖 |
| `biochar_bulk_density_kg_m3` | 🅼 | **dummy** — Corn 180 / Cotton 200 / Chilli 170 | ✋ |
| `carbon_content_percent` | 🅼 | **dummy** — Corn 72 / Cotton 68 / Chilli 65 | ✋ |
| `hc_ratio` | 🅼 | **dummy** — Corn 0.35 / Cotton 0.40 / Chilli 0.42 | ✋ |
| `lab_status` | 🅼 | `estimated` | ✋ |
| `methane_compensation_strategy` | 🅼 | `offsetting_from_scp_fraction` | ✋ |
| `lab_submission_date` | 🅞 | dummy `2026-05-01` | ✋ |
| `lab_analysis_date` | 🅞 | dummy `2026-05-15` | ✋ |
| `lab_report_doc_url` / `_image_url` | 🅞 | placeholder PDF / JPG | 🤖 |
| `ghg_avoidance_approval_doc_url` / `_image_url` | 🅞 | placeholder | 🤖 |
| `biomass_preparation_instruction` | 🅞 | dummy text, prefixed "DUMMY TEST DATA" | ✋ |

**⚠️ These three numbers are the ones that matter.** Bulk density, carbon content and H/C ratio feed the carbon-credit maths. The values in config are placeholders picked to be plausible, **not lab-verified**. Flag clearly to anyone reading the dashboard that these are test figures. `lab_status: 'estimated'` is what marks them as such in the UI.

---

# REQUIREMENT 6 — Farms (farmers)

16 farmers from the mixing sheet. 13 farms already exist in the DB — the script matches on name (case-insensitive) and reuses rather than duplicating.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `farmer_name` | 🅼 | sheet "Name of the Farmer" | 🤖 |
| `latitude` / `longitude` | 🅼 | sheet mixing GPS | 🤖 |
| `address` | 🅼 | site + state (`Parkala, Telangana`) | 🤖 |
| `total_land_size` | 🅼 | sheet "Area" | 🤖 |
| `crops` | 🅼 | sheet "Crop" + area + mixing date | 🤖 |
| `interested_in_biochar` | 🅼 | `true` | 🤖 |
| `prior_biochar_exp` | 🅼 | `false` | 🤖 |
| `estimated_biomass` | 🅼 | **derived** — acres × per-crop rate (Cotton 2, Chilli 1.5, Corn 2.5 t/acre) | ✋ |
| `created_by` / `assigned_to` | 🅼 | migration operator | 🤖 |
| `mobile_number` | 🅞 | sheet "Phone Number", last 10 digits | 🤖 |
| `consent_document_url` | 🅞 | placeholder PDF | 🤖 |
| `prior_biochar_acreage` | 🅞 | null | 🤖 |

**Note:** real farmer names and phone numbers are being written to the live DB. Confirm that's acceptable before running.

---

# REQUIREMENT 7 — Photos ⚠️ BLOCKED ON KOBO TOKEN

**~1,103 attachments** to move from Kobo into Supabase storage.

| Bucket | What goes in it | Count |
|---|---|---|
| `pyrolysis` | feedstock, 5× moisture, 4 stage photos, unloaded biochar | ~1,030 |
| `mixing` | biochar, compost, final mixture, farmer, consent | ~73 |

**How it works:**

1. Download from Kobo with `Authorization: Token <key>` — GET only, never modifies Kobo
2. Cache to disk in `scripts/migration/photos/`, keyed by attachment ID
3. Upload to Supabase at a path derived from the batch/entry ID
4. Record the mapping in `data/photo-map.json`

**Safety properties (worth explaining):**
- Cache means an interrupted run resumes without re-downloading
- Re-running skips anything already in `photo-map.json`
- Failures are collected in `data/photo-failures.json` and retried on the next run — one bad attachment never aborts the batch
- A photo that can't be fetched falls back to a placeholder image, and step 4 reports exactly which ones

**⚠️ Known issue to flag:** every bucket on this project is **private** (`public: false`) — including `mixing`, even though migration `009` declares it public. The mobile app calls `getPublicUrl()` anyway, so migrated rows store the same URL shape as existing rows. This means **photos may not render in the dashboard** without signed URLs. That's a pre-existing app behaviour, not something the migration introduces — but expect it and don't chase it as a migration bug.

---

# REQUIREMENT 8 — Pyrolysis Sessions & Batches

One session + one batch per production row. 93 rows.

**Session** — all mandatory fields are derived, nothing to supply. 🤖

| Field | Mandatory | Value comes from |
|---|:--:|---|
| `operator_id` | 🅼 | R1 |
| `status` | 🅼 | `completed` |
| `current_step` | 🅼 | `complete` |
| `created_at` | 🅼 | sheet `start` |
| `completed_at` | 🅞 | sheet `end` |

**Batch** — only 4 fields are actually mandatory; the rest is real Kobo data.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `session_id`, `kontikki_id`, `kontikki_code` | 🅼 | R4 + sheet | 🤖 |
| `info_completed` / `moisture_completed` / `pyrolysis_completed` | 🅼 | `true` | 🤖 |
| `batch_number` | 🅞 | sheet "Batch Number" | 🤖 |
| `feedstock_id` / `feedstock_name` | 🅞 | R5 + sheet | 🤖 |
| `location_lat` / `_lng` / `_address` | 🅞 | sheet "Location" | 🤖 |
| `moisture_reading_1..5` | 🅞 | sheet, 5 readings | 🤖 |
| `moisture_photo_url_1..5` | 🅞 | R7 | 🤖 |
| `stage_initial/middle/final/quenching_photo_url` | 🅞 | R7 | 🤖 |
| `stage_*_captured_at` / `_saved_at` | 🅞 | sheet times | 🤖 |
| `*_photo_metadata` | 🅞 | GPS + timestamp built from sheet | 🤖 |
| `yield_percent` | 🅞 | sheet "% of biochar made" | 🤖 |
| `sample_photo_url` | 🅞 | "Biochar unloaded photo" — **see note** | 🤖 |
| `comment` | 🅞 | marker + remark + rejection reason | 🤖 |
| `feedstock_quantity`, `avg_feedstock_size_cm`, `farm_id`, `feedstock_size_photo_url` | 🅞 | **not in Kobo data — left null** | — |

**⚠️ Two data-shape mismatches to raise with the team:**

1. **"Biochar unloaded photo" has no home.** There is no `unloaded_photo_url` column. The script parks it on `sample_photo_url`. Either add a proper column or accept the workaround — but decide consciously.
2. **Four fields the portal expects are simply absent from Kobo:** feedstock quantity, average feedstock size, the farm the feedstock came from, and the feedstock-size photo. These stay null. If the dashboard requires them for approval, that's a form-design gap to fix before real (non-test) migration.

**Timezone note:** Kobo writes naive local timestamps with no zone. The script pins them to IST (+05:30) explicitly, so the same input produces the same output regardless of whose laptop runs it.

---

# REQUIREMENT 9 — Batch Review Status

Carries the sheet's "Status of the batch" into the review workflow, so the dashboard shows realistic approve/reject states rather than everything pending.

| Sheet value | → DB status |
|---|---|
| Approved | `accepted` |
| Rejected | `rejected` |
| Hold | `on_hold` |
| anything else / blank | `pending` |

All mandatory fields derived. 🤖

---

# REQUIREMENT 10 — Mixing Entries

16 entries.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `operator_id` | 🅼 | R1 | 🤖 |
| `started_at` | 🅼 | sheet "Date of Mixing" | 🤖 |
| `material_type` | 🅼 | **dummy** `biological_matrix_compost` | ✋ |
| `status` | 🅼 | `submitted` | 🤖 |
| `farm_id` / `farm_name` | 🅞 | R6 | 🤖 |
| `location_lat` / `_lng` / `_address` | 🅞 | sheet GPS | 🤖 |
| `material_to_biochar_ratio` | 🅞 | **dummy** `3` | ✋ |
| `biochar_photo_url` | 🅞 | sheet "Biochar picture" | 🤖 |
| `substrate_photo_url` | 🅞 | sheet "Compost picture" | 🤖 |
| `mixing_photo_url` | 🅞 | sheet "Final mixture picture" | 🤖 |
| `comment` | 🅞 | marker + crop + area + cited batches + skipped batches | 🤖 |

**⚠️ Not captured in Kobo:** material type and mixing ratio. Both are dummy. The Kobo form never asked, so there is no right answer to recover — flag it as a form gap.

**Also dropped:** the sheet's farmer photo and signed consent copy are downloaded and stored, but `mixing_entries` has no column for them. They live in storage only.

---

# REQUIREMENT 11 — Mixing → Pyrolysis links ⚠️ READ THIS CAREFULLY

This is where the earlier attempt fell over, and where the agreed rule matters.

Each mixing entry cites a **range** of batch numbers, e.g. `84-93`, `1-43`, `110-121`. Across the 16 entries, **123 distinct batch numbers** are referenced.

**The rule:** link every cited batch that exists; silently skip the ones that don't; never drop the mixing entry.

> Example: entry cites `1-10`. Batch 3 was never migrated. → Link 1, 2, 4, 5, 6, 7, 8, 9, 10. Record 3 as skipped in the entry's comment and in the report. The entry still saves with 9 links.

| Field | Mandatory | Value comes from | Script |
|---|:--:|---|:--:|
| `mixing_entry_id` | 🅼 | R10 | 🤖 |
| `pyrolysis_batch_id` | 🅼 | R8, matched by batch number | 🤖 |
| `kontikki_code`, `batch_number`, `producer_name` | 🅞 | denormalised for display | 🤖 |

**Why the "include all 93 rows" decision matters here:**

| Scenario | Cited batches that resolve |
|---|---|
| All 93 production rows migrated | **93 of 123** |
| Only the 13 "clean" rows migrated | **13 of 123** |

Migrating only clean rows leaves mixing links essentially empty and doesn't test the flow. Hence `includeFlagged: true` and the dummy prerequisites in R4/R5.

**Still unresolvable:** 30 batch numbers cited by mixing entries don't appear in the production sheet at all (the issues tab flags this: *"Mix references batch #14-43 not in production sheet, 30 of 43 missing"*). Those are genuinely absent source data — no script can recover them. They will always show as skipped.

---

# REQUIREMENT 12 — Verification 👤

Do not declare the migration done until this passes.

```bash
node scripts/migration/04-verify.mjs --check-urls
```

Checks every row against the spreadsheet:

- [ ] Batch exists for every source row
- [ ] `batch_number` matches the sheet
- [ ] `kontikki_code` matches the sheet
- [ ] `yield_percent` matches the sheet
- [ ] All 5 moisture readings match
- [ ] Every photo URL points at Supabase, **not still at Kobo**
- [ ] No photo silently fell back to the placeholder
- [ ] Storage objects actually resolve
- [ ] Every mixing entry exists
- [ ] Mixing links = cited batches **minus** genuinely-absent ones
- [ ] No unexpected links

Output: `data/verification-report.json`, grouped by problem type.

---

# RUN ORDER

```bash
cd ~/Desktop/Kishecarbon/Tech

# 0. snapshot (read-only) — already done
node scripts/migration/00-inspect-db.mjs

# 1. reference records — dry run first, always
node scripts/migration/01-create-refs.mjs
node scripts/migration/01-create-refs.mjs --apply

# 2. photos (needs KOBO_API_TOKEN)
node scripts/migration/02-migrate-photos.mjs
node scripts/migration/02-migrate-photos.mjs --apply

# 3. entries + links
node scripts/migration/03-migrate-entries.mjs
node scripts/migration/03-migrate-entries.mjs --apply

# 4. verify
node scripts/migration/04-verify.mjs --check-urls
```

Every script is **re-runnable**. IDs are derived deterministically from the Kobo unique code, so a second run updates the same rows instead of creating duplicates. If something fails halfway, fix it and run again.

---

# OPEN DECISIONS — need sign-off before `--apply`

| # | Question | Default if nobody decides |
|:--:|---|---|
| 1 | Kobo API token — who provides it? | **Blocked, cannot proceed** |
| 2 | Real kiln dimensions for PP001–PP010 / GF001–GF006? | Dummy 220/90/90 cm |
| 3 | Real lab values for Corn Cobs / Cotton / Chilli? | Dummy, `lab_status: estimated` |
| 4 | OK to write real farmer names + phone numbers to the live DB? | Yes, they get written |
| 5 | New bot operator, or reuse an existing user? | New bot user |
| 6 | "Biochar unloaded photo" — add a column, or keep it on `sample_photo_url`? | Keep on `sample_photo_url` |
| 7 | Private buckets mean photos may not render — sign URLs, or leave as-is? | Leave as-is (matches current app behaviour) |
| 8 | How do we clean up afterwards? | Every row is stamped `[MIGRATION-TEST-2026-08]` in its comment field |

---

# SAFETY GUARANTEES

- No script contains a DELETE against Supabase or Kobo. The shared library exposes no delete helper at all.
- Kobo is read-only throughout — GET requests only.
- Nothing writes without an explicit `--apply` flag.
- Every created row carries the marker `[MIGRATION-TEST-2026-08]`, so test data can be found and removed later without guesswork.
- Re-runs are safe: deterministic IDs mean upsert, never duplicate.
