-- KriSHE Carbon nodes report three kiln zones. Legacy batches keep a single
-- temperature column; these fields are null for those rows.

alter table kiln_temperature_readings
  add column if not exists top_c double precision,
  add column if not exists middle_c double precision,
  add column if not exists bottom_c double precision,
  add column if not exists kiln_state text;
