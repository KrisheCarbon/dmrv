-- Rainbow lab results belong to a feedstock, not to each kiln run.
-- One sample covers 200 tonnes or 6 months. CSI catalog columns may be empty
-- for a Rainbow-only feedstock.

alter table feedstocks alter column carbon_content_percent drop not null;
alter table feedstocks alter column hc_ratio drop not null;
alter table feedstocks alter column lab_status drop not null;
alter table feedstocks alter column lab_submission_date drop not null;
alter table feedstocks alter column lab_analysis_date drop not null;
alter table feedstocks alter column methane_compensation_strategy drop not null;

create table if not exists rainbow_feedstock_lab_samples (
  id uuid primary key default gen_random_uuid(),
  feedstock_id uuid not null references feedstocks (id),
  analyzed_on date not null,
  organic_carbon_percent numeric not null
    check (organic_carbon_percent > 0 and organic_carbon_percent <= 100),
  hcorg numeric not null check (hcorg > 0 and hcorg < 0.7),
  lab_name text not null,
  report_url text,
  created_at timestamptz not null default now()
);

comment on table rainbow_feedstock_lab_samples is
  'Organic carbon and H/Corg for a feedstock. One row covers the next 200 tonnes or 6 months of kiln runs, whichever comes first.';

alter table rainbow_feedstock_lab_samples enable row level security;
