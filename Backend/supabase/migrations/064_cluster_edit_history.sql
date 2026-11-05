-- Keep the previous values when a farmer, farm, or soil sample is edited.
-- The main row is updated. Each history item is
-- { "at": "ISO time", "by": "user uuid", "previous": { "column": old value } }.

alter table farms
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

alter table farm_fields
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

alter table soil_tests
  add column if not exists edit_history jsonb not null default '[]'::jsonb;
