-- Rainbow pyrolysis evidence lives in its own tables so CSI's 5-slot
-- pyrolysis_batches columns stay untouched.
-- Rainbow needs 10 moisture photos and a variable number of "biomass in
-- kontikki" production photos.

create table if not exists rainbow_pyrolysis_batches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references pyrolysis_sessions (id) on delete cascade,
  kontikki_id uuid not null references kontikkis (id),
  kontikki_code text not null,
  producer_id uuid references biochar_producers (id),
  producer_name text,
  batch_number text,
  feedstock_quantity numeric,
  avg_feedstock_size_cm numeric,
  feedstock_id uuid,
  feedstock_name text,
  location_lat numeric,
  location_lng numeric,
  location_address text,
  feedstock_photo_url text,
  feedstock_size_photo_url text,
  feedstock_photo_metadata jsonb,
  feedstock_size_photo_metadata jsonb,
  info_completed boolean not null default false,
  moisture_completed boolean not null default false,
  production_completed boolean not null default false,
  yield_completed boolean not null default false,
  sample_completed boolean not null default false,
  info_saved_at timestamptz,
  moisture_saved_at timestamptz,
  production_saved_at timestamptz,
  yield_saved_at timestamptz,
  yield_percent numeric,
  comment text,
  sample_id text,
  sample_photo_url text,
  sample_photo_metadata jsonb,
  sample_saved_at timestamptz,
  submission_status text not null default 'draft'
    check (submission_status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, kontikki_id)
);

create table if not exists rainbow_pyrolysis_moisture (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references rainbow_pyrolysis_batches (id) on delete cascade,
  slot integer not null check (slot between 1 and 10),
  reading numeric,
  photo_url text,
  photo_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, slot)
);

create table if not exists rainbow_pyrolysis_biomass_loads (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references rainbow_pyrolysis_batches (id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  photo_url text,
  photo_metadata jsonb,
  captured_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, sequence)
);

create index if not exists rainbow_pyrolysis_batches_session_idx
  on rainbow_pyrolysis_batches (session_id);
create index if not exists rainbow_pyrolysis_batches_kontikki_idx
  on rainbow_pyrolysis_batches (kontikki_id);
create index if not exists rainbow_pyrolysis_moisture_batch_idx
  on rainbow_pyrolysis_moisture (batch_id);
create index if not exists rainbow_pyrolysis_biomass_loads_batch_idx
  on rainbow_pyrolysis_biomass_loads (batch_id);

drop trigger if exists rainbow_pyrolysis_batches_updated_at on rainbow_pyrolysis_batches;
create trigger rainbow_pyrolysis_batches_updated_at
  before update on rainbow_pyrolysis_batches
  for each row execute function pyrolysis_set_updated_at();

drop trigger if exists rainbow_pyrolysis_moisture_updated_at on rainbow_pyrolysis_moisture;
create trigger rainbow_pyrolysis_moisture_updated_at
  before update on rainbow_pyrolysis_moisture
  for each row execute function pyrolysis_set_updated_at();

drop trigger if exists rainbow_pyrolysis_biomass_loads_updated_at on rainbow_pyrolysis_biomass_loads;
create trigger rainbow_pyrolysis_biomass_loads_updated_at
  before update on rainbow_pyrolysis_biomass_loads
  for each row execute function pyrolysis_set_updated_at();

alter table rainbow_pyrolysis_batches enable row level security;
alter table rainbow_pyrolysis_moisture enable row level security;
alter table rainbow_pyrolysis_biomass_loads enable row level security;

drop policy if exists rainbow_pyrolysis_batches_select on rainbow_pyrolysis_batches;
create policy rainbow_pyrolysis_batches_select on rainbow_pyrolysis_batches
  for select to authenticated
  using (exists (
    select 1 from pyrolysis_sessions s
    where s.id = session_id and s.operator_id = auth.uid()
  ));

drop policy if exists rainbow_pyrolysis_moisture_select on rainbow_pyrolysis_moisture;
create policy rainbow_pyrolysis_moisture_select on rainbow_pyrolysis_moisture
  for select to authenticated
  using (exists (
    select 1
    from rainbow_pyrolysis_batches b
    join pyrolysis_sessions s on s.id = b.session_id
    where b.id = batch_id and s.operator_id = auth.uid()
  ));

drop policy if exists rainbow_pyrolysis_biomass_loads_select on rainbow_pyrolysis_biomass_loads;
create policy rainbow_pyrolysis_biomass_loads_select on rainbow_pyrolysis_biomass_loads
  for select to authenticated
  using (exists (
    select 1
    from rainbow_pyrolysis_batches b
    join pyrolysis_sessions s on s.id = b.session_id
    where b.id = batch_id and s.operator_id = auth.uid()
  ));

comment on table rainbow_pyrolysis_batches is
  'Rainbow-standard pyrolysis batches. CSI batches stay on pyrolysis_batches.';
comment on table rainbow_pyrolysis_moisture is
  'Exactly 10 moisture photo+reading slots per Rainbow batch.';
comment on table rainbow_pyrolysis_biomass_loads is
  'One row per time biomass is loaded into the kontikki during a Rainbow run.';
