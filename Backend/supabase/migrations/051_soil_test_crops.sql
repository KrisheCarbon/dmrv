-- Soil samples record the crop harvested before sampling and the crop planned next.

alter table if exists soil_tests
  add column if not exists last_crop text,
  add column if not exists next_crop text;
