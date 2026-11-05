-- Dig points stay inside the farm. The mixed sample, the info sheet, and the
-- consent photos may be taken outside it, and the place each was taken is kept.

alter table if exists soil_tests
  add column if not exists info_sheet_lat double precision,
  add column if not exists info_sheet_lng double precision;

alter table if exists farmer_consents
  add column if not exists photo_captures jsonb not null default '[]'::jsonb;

comment on column soil_tests.sample_lat is
  'Latitude where the mixed soil sample photo was taken. May be outside the farm.';
comment on column soil_tests.sample_lng is
  'Longitude where the mixed soil sample photo was taken. May be outside the farm.';
comment on column soil_tests.info_sheet_lat is
  'Latitude where the soil sample info sheet photo was taken.';
comment on column soil_tests.info_sheet_lng is
  'Longitude where the soil sample info sheet photo was taken.';
comment on column farmer_consents.photo_captures is
  'GPS of each consent photo, in the same order as photos. May be outside the farm.';
