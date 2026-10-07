-- Rainbow credit inputs. The feedstock catalog H/C (under 0.4) is a different test.

create table if not exists rainbow_batch_lab_samples (
  pyrolysis_batch_id uuid primary key references rainbow_pyrolysis_batches (id) on delete cascade,
  organic_carbon_percent numeric not null
    check (organic_carbon_percent > 0 and organic_carbon_percent <= 100),
  hcorg numeric not null check (hcorg > 0 and hcorg < 0.7),
  lab_name text not null,
  analyzed_on date not null,
  report_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table rainbow_batch_lab_samples is
  'One representative lab sample per kiln run: organic carbon and H/Corg. Rainbow requires H/Corg under 0.7.';

create table if not exists rainbow_pollutant_tests (
  id uuid primary key default gen_random_uuid(),
  feedstock_id uuid not null references feedstocks (id),
  test_year integer not null check (test_year between 2000 and 2100),
  lead_mg_kg numeric not null check (lead_mg_kg >= 0),
  cadmium_mg_kg numeric not null check (cadmium_mg_kg >= 0),
  copper_mg_kg numeric not null check (copper_mg_kg >= 0),
  nickel_mg_kg numeric not null check (nickel_mg_kg >= 0),
  mercury_mg_kg numeric not null check (mercury_mg_kg >= 0),
  zinc_mg_kg numeric not null check (zinc_mg_kg >= 0),
  chromium_mg_kg numeric not null check (chromium_mg_kg >= 0),
  arsenic_mg_kg numeric not null check (arsenic_mg_kg >= 0),
  tested_on date not null,
  lab_name text not null,
  report_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedstock_id, test_year)
);

comment on table rainbow_pollutant_tests is
  'Yearly biochar test for lead, cadmium, copper, nickel, mercury, zinc, chromium, and arsenic. Open kilns do not report PAH.';

create table if not exists rainbow_methane_measurements (
  id uuid primary key default gen_random_uuid(),
  feedstock_id uuid not null references feedstocks (id),
  kontikki_id uuid not null references kontikkis (id),
  period_year integer not null check (period_year between 2000 and 2100),
  measured_on date not null,
  kg_ch4_per_kg_biochar numeric not null check (kg_ch4_per_kg_biochar > 0),
  provider_name text not null,
  report_url text,
  created_at timestamptz not null default now(),
  unique (feedstock_id, kontikki_id, period_year, measured_on)
);

comment on table rainbow_methane_measurements is
  'Carbon mass balance result in kg CH4 per kg biochar. Credits use the mean plus one standard deviation after three runs on three kilns.';

create table if not exists rainbow_emission_inputs (
  feedstock_id uuid not null references feedstocks (id),
  period_year integer not null check (period_year between 2000 and 2100),
  biomass_left_on_soil boolean not null,
  sequestration_rate numeric not null default 0.005 check (sequestration_rate >= 0.005),
  biomass_carbon_fraction numeric
    check (biomass_carbon_fraction is null or (biomass_carbon_fraction > 0 and biomass_carbon_fraction <= 1)),
  transport_tco2e numeric not null check (transport_tco2e >= 0),
  kiln_steel_tco2e numeric not null check (kiln_steel_tco2e >= 0),
  processing_tco2e numeric not null check (processing_tco2e >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (feedstock_id, period_year),
  check (biomass_left_on_soil = false or biomass_carbon_fraction is not null)
);

comment on table rainbow_emission_inputs is
  'Leakage, transport, kiln steel, and chipping or drying energy. A missing row blocks credit issuance; zero is an entered value.';

create table if not exists rainbow_mixing_soil_temperature (
  mixing_entry_id uuid primary key references rainbow_mixing_entries (id) on delete cascade,
  soil_temp_c numeric not null check (soil_temp_c > -20 and soil_temp_c < 50),
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table rainbow_mixing_soil_temperature is
  'Mean annual soil temperature at the mixing GPS. Fperm = c - m x H/Corg uses this temperature.';

alter table rainbow_batch_lab_samples enable row level security;
alter table rainbow_pollutant_tests enable row level security;
alter table rainbow_methane_measurements enable row level security;
alter table rainbow_emission_inputs enable row level security;
alter table rainbow_mixing_soil_temperature enable row level security;
