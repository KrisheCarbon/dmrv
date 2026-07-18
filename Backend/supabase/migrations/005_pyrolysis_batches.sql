-- Pyrolysis: 2 tables only — sessions + batches (all readings/photos/URLs as columns).
-- Run after 004 if already applied, or instead of 004 on a fresh DB.

drop table if exists pyrolysis_batch_moisture cascade;
drop table if exists pyrolysis_batch_stages cascade;
drop table if exists pyrolysis_kontikki_locks cascade;
drop table if exists pyrolysis_session_kontikkis cascade;

create table if not exists pyrolysis_sessions (
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

create table if not exists pyrolysis_batches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references pyrolysis_sessions (id) on delete cascade,
  kontikki_id uuid not null references kontikkis (id),
  kontikki_code text not null,
  batch_number text,
  feedstock_quantity numeric,
  farm_id uuid references farms (id),
  farm_name text,
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
  moisture_reading_1 numeric,
  moisture_reading_2 numeric,
  moisture_reading_3 numeric,
  moisture_reading_4 numeric,
  moisture_reading_5 numeric,
  moisture_photo_url_1 text,
  moisture_photo_url_2 text,
  moisture_photo_url_3 text,
  moisture_photo_url_4 text,
  moisture_photo_url_5 text,
  moisture_photo_metadata_1 jsonb,
  moisture_photo_metadata_2 jsonb,
  moisture_photo_metadata_3 jsonb,
  moisture_photo_metadata_4 jsonb,
  moisture_photo_metadata_5 jsonb,
  stage_initial_photo_url text,
  stage_middle_photo_url text,
  stage_final_photo_url text,
  stage_quenching_photo_url text,
  stage_initial_captured_at timestamptz,
  stage_middle_captured_at timestamptz,
  stage_final_captured_at timestamptz,
  stage_quenching_captured_at timestamptz,
  stage_initial_saved_at timestamptz,
  stage_middle_saved_at timestamptz,
  stage_final_saved_at timestamptz,
  stage_quenching_saved_at timestamptz,
  stage_initial_photo_metadata jsonb,
  stage_middle_photo_metadata jsonb,
  stage_final_photo_metadata jsonb,
  stage_quenching_photo_metadata jsonb,
  info_completed boolean not null default false,
  moisture_completed boolean not null default false,
  pyrolysis_completed boolean not null default false,
  info_saved_at timestamptz,
  moisture_saved_at timestamptz,
  pyrolysis_saved_at timestamptz,
  yield_saved_at timestamptz,
  yield_percent numeric,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, kontikki_id)
);

create index if not exists pyrolysis_sessions_operator_idx on pyrolysis_sessions (operator_id);
create index if not exists pyrolysis_sessions_status_idx on pyrolysis_sessions (status);
create index if not exists pyrolysis_batches_session_idx on pyrolysis_batches (session_id);
create index if not exists pyrolysis_batches_kontikki_idx on pyrolysis_batches (kontikki_id);

create or replace function pyrolysis_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pyrolysis_sessions_updated_at on pyrolysis_sessions;
create trigger pyrolysis_sessions_updated_at
  before update on pyrolysis_sessions
  for each row execute function pyrolysis_set_updated_at();

drop trigger if exists pyrolysis_batches_updated_at on pyrolysis_batches;
create trigger pyrolysis_batches_updated_at
  before update on pyrolysis_batches
  for each row execute function pyrolysis_set_updated_at();

alter table pyrolysis_sessions enable row level security;
alter table pyrolysis_batches enable row level security;

drop policy if exists pyrolysis_sessions_select_own on pyrolysis_sessions;
create policy pyrolysis_sessions_select_own on pyrolysis_sessions
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists pyrolysis_batches_select on pyrolysis_batches;
create policy pyrolysis_batches_select on pyrolysis_batches
  for select to authenticated
  using (exists (
    select 1 from pyrolysis_sessions s
    where s.id = session_id and s.operator_id = auth.uid()
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pyrolysis',
  'pyrolysis',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pyrolysis_storage_select on storage.objects;
drop policy if exists pyrolysis_storage_insert on storage.objects;
drop policy if exists pyrolysis_storage_update on storage.objects;
drop policy if exists pyrolysis_storage_delete on storage.objects;

create policy pyrolysis_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'pyrolysis');
create policy pyrolysis_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'pyrolysis');
create policy pyrolysis_storage_update on storage.objects
  for update to authenticated using (bucket_id = 'pyrolysis') with check (bucket_id = 'pyrolysis');
create policy pyrolysis_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'pyrolysis');
