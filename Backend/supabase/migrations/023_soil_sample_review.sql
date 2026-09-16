-- Soil sample collect → submit → accept/reject/store, plus receive photo.

alter table if exists soil_tests
  add column if not exists receive_photo_url text;

alter table if exists soil_tests
  alter column status set default 'collected';
