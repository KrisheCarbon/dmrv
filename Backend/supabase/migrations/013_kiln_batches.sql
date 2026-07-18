-- Kiln sensor batches: encrypted payloads from ESP32 are decrypted on the backend
-- and stored as structured temperature time-series data.

create table if not exists kiln_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  kiln_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  start_time_utc timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  ended_at timestamptz not null,
  source_filename text not null,
  local_id text,
  uploaded_by uuid references users (id),
  created_at timestamptz not null default now(),
  unique (batch_name),
  unique (source_filename)
);

create table if not exists kiln_temperature_readings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references kiln_batches (id) on delete cascade,
  time_offset_seconds integer not null check (time_offset_seconds >= 0),
  temperature double precision not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists kiln_batches_uploaded_by_idx
  on kiln_batches (uploaded_by, created_at desc);

create index if not exists kiln_temperature_readings_batch_id_idx
  on kiln_temperature_readings (batch_id, time_offset_seconds);

alter table kiln_batches enable row level security;
alter table kiln_temperature_readings enable row level security;

create policy "Service role full access kiln_batches"
  on kiln_batches
  for all
  using (true)
  with check (true);

create policy "Service role full access kiln_temperature_readings"
  on kiln_temperature_readings
  for all
  using (true)
  with check (true);
