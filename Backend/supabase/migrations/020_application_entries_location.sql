alter table application_entries
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_address text;
