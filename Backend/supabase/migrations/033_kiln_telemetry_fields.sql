-- Fields the KriSHE Carbon node sends every second, beyond the three temperatures.

alter table kiln_temperature_readings
  add column if not exists top_valid boolean,
  add column if not exists middle_valid boolean,
  add column if not exists bottom_valid boolean,
  add column if not exists top_open boolean,
  add column if not exists middle_open boolean,
  add column if not exists bottom_open boolean,
  add column if not exists top_rate double precision,
  add column if not exists middle_rate double precision,
  add column if not exists bottom_rate double precision,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists satellites integer,
  add column if not exists utc_epoch bigint,
  add column if not exists uptime_s integer;
