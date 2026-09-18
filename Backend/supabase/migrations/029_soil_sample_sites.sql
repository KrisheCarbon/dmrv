-- Composite soil sampling: GPS-tagged dig points mixed into one sample.

alter table if exists soil_tests
  add column if not exists sample_sites jsonb not null default '[]'::jsonb;
