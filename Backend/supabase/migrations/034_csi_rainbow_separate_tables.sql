-- The unprefixed pyrolysis and mixing tables hold CSI records.
-- Rename them before the Rainbow rule migration, and give Rainbow
-- its own session and mixing tables. Existing rows stay in place.

alter table if exists pyrolysis_sessions rename to csi_pyrolysis_sessions;
alter table if exists pyrolysis_batches rename to csi_pyrolysis_batches;
alter table if exists pyrolysis_batch_status rename to csi_pyrolysis_batch_status;
alter table if exists pyrolysis_batch_status_flags rename to csi_pyrolysis_batch_status_flags;
alter table if exists mixing_entries rename to csi_mixing_entries;
alter table if exists mixing_pyrolysis_links rename to csi_mixing_pyrolysis_links;
alter table if exists mixing_entry_status rename to csi_mixing_entry_status;
alter table if exists mixing_entry_photo_flags rename to csi_mixing_entry_photo_flags;

create table if not exists rainbow_pyrolysis_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references users (id),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  current_step text not null default 'info'
    check (current_step in ('select', 'info', 'moisture', 'pyrolysis', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

insert into rainbow_pyrolysis_sessions (
  id, operator_id, status, current_step, created_at, updated_at, completed_at
)
select s.id, s.operator_id, s.status, s.current_step, s.created_at, s.updated_at, s.completed_at
from csi_pyrolysis_sessions s
where exists (
  select 1 from rainbow_pyrolysis_batches b where b.session_id = s.id
)
on conflict (id) do nothing;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_attribute att
    on att.attrelid = rel.oid
   and att.attnum = any (con.conkey)
  where nsp.nspname = 'public'
    and rel.relname = 'rainbow_pyrolysis_batches'
    and con.contype = 'f'
    and att.attname = 'session_id';

  if constraint_name is not null then
    execute format(
      'alter table rainbow_pyrolysis_batches drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table rainbow_pyrolysis_batches
  add constraint rainbow_pyrolysis_batches_session_id_fkey
  foreign key (session_id) references rainbow_pyrolysis_sessions (id) on delete cascade;

delete from csi_pyrolysis_sessions s
where not exists (
  select 1 from csi_pyrolysis_batches b where b.session_id = s.id
);

drop trigger if exists rainbow_pyrolysis_sessions_updated_at on rainbow_pyrolysis_sessions;
create trigger rainbow_pyrolysis_sessions_updated_at
  before update on rainbow_pyrolysis_sessions
  for each row execute function pyrolysis_set_updated_at();

alter table rainbow_pyrolysis_sessions enable row level security;

drop policy if exists rainbow_pyrolysis_sessions_select_own on rainbow_pyrolysis_sessions;
create policy rainbow_pyrolysis_sessions_select_own on rainbow_pyrolysis_sessions
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists rainbow_pyrolysis_batches_select on rainbow_pyrolysis_batches;
create policy rainbow_pyrolysis_batches_select on rainbow_pyrolysis_batches
  for select to authenticated
  using (exists (
    select 1 from rainbow_pyrolysis_sessions s
    where s.id = session_id and s.operator_id = auth.uid()
  ));

drop policy if exists rainbow_pyrolysis_moisture_select on rainbow_pyrolysis_moisture;
create policy rainbow_pyrolysis_moisture_select on rainbow_pyrolysis_moisture
  for select to authenticated
  using (exists (
    select 1
    from rainbow_pyrolysis_batches b
    join rainbow_pyrolysis_sessions s on s.id = b.session_id
    where b.id = batch_id and s.operator_id = auth.uid()
  ));

drop policy if exists rainbow_pyrolysis_biomass_loads_select on rainbow_pyrolysis_biomass_loads;
create policy rainbow_pyrolysis_biomass_loads_select on rainbow_pyrolysis_biomass_loads
  for select to authenticated
  using (exists (
    select 1
    from rainbow_pyrolysis_batches b
    join rainbow_pyrolysis_sessions s on s.id = b.session_id
    where b.id = batch_id and s.operator_id = auth.uid()
  ));

create table if not exists rainbow_mixing_entries (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references users (id),
  started_at timestamptz not null,
  farm_id uuid references farms (id),
  farm_name text,
  location_lat numeric,
  location_lng numeric,
  location_address text,
  material_type text not null
    check (material_type in (
      'biological_matrix_compost',
      'biochar_based_fertilizer',
      'solid_manure',
      'liquid_manure'
    )),
  material_to_biochar_ratio numeric,
  comment text,
  biochar_photo_url text,
  biochar_photo_metadata jsonb,
  substrate_photo_url text,
  substrate_photo_metadata jsonb,
  mixing_photo_url text,
  mixing_photo_metadata jsonb,
  status text not null default 'submitted'
    check (status in ('submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rainbow_mixing_pyrolysis_links (
  mixing_entry_id uuid not null references rainbow_mixing_entries (id) on delete cascade,
  pyrolysis_batch_id uuid not null references rainbow_pyrolysis_batches (id),
  kontikki_code text,
  batch_number text,
  producer_name text,
  primary key (mixing_entry_id, pyrolysis_batch_id)
);

create unique index if not exists rainbow_mixing_pyrolysis_links_batch_unique
  on rainbow_mixing_pyrolysis_links (pyrolysis_batch_id);

create index if not exists rainbow_mixing_entries_operator_idx
  on rainbow_mixing_entries (operator_id);
create index if not exists rainbow_mixing_entries_started_at_idx
  on rainbow_mixing_entries (started_at desc);
create index if not exists rainbow_mixing_pyrolysis_links_batch_idx
  on rainbow_mixing_pyrolysis_links (pyrolysis_batch_id);

create table if not exists rainbow_mixing_entry_status (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references rainbow_mixing_entries (id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'on_hold')),
  reviewer_notes text,
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rainbow_mixing_entry_photo_flags (
  id uuid primary key default gen_random_uuid(),
  entry_status_id uuid not null references rainbow_mixing_entry_status (id) on delete cascade,
  photo_key text not null check (photo_key in ('biochar', 'substrate', 'mixing')),
  flagged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_status_id, photo_key)
);

create index if not exists rainbow_mixing_entry_status_entry_idx
  on rainbow_mixing_entry_status (entry_id);
create index if not exists rainbow_mixing_entry_status_status_idx
  on rainbow_mixing_entry_status (status);
create index if not exists rainbow_mixing_entry_photo_flags_status_idx
  on rainbow_mixing_entry_photo_flags (entry_status_id);

drop trigger if exists rainbow_mixing_entries_updated_at on rainbow_mixing_entries;
create trigger rainbow_mixing_entries_updated_at
  before update on rainbow_mixing_entries
  for each row execute function mixing_set_updated_at();

drop trigger if exists rainbow_mixing_entry_status_updated_at on rainbow_mixing_entry_status;
create trigger rainbow_mixing_entry_status_updated_at
  before update on rainbow_mixing_entry_status
  for each row execute function mixing_set_updated_at();

drop trigger if exists rainbow_mixing_entry_photo_flags_updated_at on rainbow_mixing_entry_photo_flags;
create trigger rainbow_mixing_entry_photo_flags_updated_at
  before update on rainbow_mixing_entry_photo_flags
  for each row execute function mixing_set_updated_at();

alter table rainbow_mixing_entries enable row level security;
alter table rainbow_mixing_pyrolysis_links enable row level security;
alter table rainbow_mixing_entry_status enable row level security;
alter table rainbow_mixing_entry_photo_flags enable row level security;

drop policy if exists rainbow_mixing_entries_select_own on rainbow_mixing_entries;
create policy rainbow_mixing_entries_select_own on rainbow_mixing_entries
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists rainbow_mixing_entries_insert_own on rainbow_mixing_entries;
create policy rainbow_mixing_entries_insert_own on rainbow_mixing_entries
  for insert to authenticated with check (operator_id = auth.uid());

drop policy if exists rainbow_mixing_entries_update_own on rainbow_mixing_entries;
create policy rainbow_mixing_entries_update_own on rainbow_mixing_entries
  for update to authenticated using (operator_id = auth.uid());

drop policy if exists rainbow_mixing_pyrolysis_links_select on rainbow_mixing_pyrolysis_links;
create policy rainbow_mixing_pyrolysis_links_select on rainbow_mixing_pyrolysis_links
  for select to authenticated
  using (exists (
    select 1 from rainbow_mixing_entries m
    where m.id = mixing_entry_id and m.operator_id = auth.uid()
  ));

drop policy if exists rainbow_mixing_pyrolysis_links_insert on rainbow_mixing_pyrolysis_links;
create policy rainbow_mixing_pyrolysis_links_insert on rainbow_mixing_pyrolysis_links
  for insert to authenticated
  with check (exists (
    select 1 from rainbow_mixing_entries m
    where m.id = mixing_entry_id and m.operator_id = auth.uid()
  ));

comment on table csi_pyrolysis_sessions is
  'CSI pyrolysis sessions. Rainbow sessions live in rainbow_pyrolysis_sessions.';
comment on table csi_pyrolysis_batches is
  'CSI pyrolysis batches.';
comment on table csi_mixing_entries is
  'CSI mixing entries. Rainbow mixes live in rainbow_mixing_entries.';
comment on table rainbow_pyrolysis_sessions is
  'Rainbow pyrolysis sessions. A field visit that includes both registries stores the same id in both session tables.';
comment on table rainbow_mixing_entries is
  'Rainbow mixing entries. Each entry links only Rainbow pyrolysis batches.';
