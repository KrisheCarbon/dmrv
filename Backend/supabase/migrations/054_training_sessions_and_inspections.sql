-- Training sessions and site inspections.
-- A session can cover several producers. An inspection is one producer.
-- Files live in private buckets; the API returns signed links.

create table if not exists training_sessions (
  id uuid primary key default gen_random_uuid(),
  held_at timestamptz not null,
  trainer_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  location_label text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_sessions_coords check (
    latitude between -90 and 90 and longitude between -180 and 180
  )
);

create table if not exists training_session_producers (
  training_id uuid not null references training_sessions (id) on delete cascade,
  producer_id uuid not null references biochar_producers (id),
  primary key (training_id, producer_id)
);

create table if not exists training_session_files (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references training_sessions (id) on delete cascade,
  kind text not null check (kind in ('attendance', 'material', 'photo', 'video')),
  bucket text not null,
  path text not null,
  file_name text not null,
  content_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists training_sessions_held_idx
  on training_sessions (held_at desc);

create index if not exists training_session_files_training_idx
  on training_session_files (training_id);

create table if not exists site_inspections (
  id uuid primary key default gen_random_uuid(),
  held_at timestamptz not null,
  producer_id uuid not null references biochar_producers (id),
  inspector_name text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_inspection_files (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references site_inspections (id) on delete cascade,
  kind text not null check (kind in ('report', 'photo', 'video')),
  bucket text not null,
  path text not null,
  file_name text not null,
  content_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists site_inspections_held_idx
  on site_inspections (held_at desc);

create index if not exists site_inspection_files_inspection_idx
  on site_inspection_files (inspection_id);

create or replace function field_ops_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_sessions_updated_at on training_sessions;
create trigger training_sessions_updated_at
  before update on training_sessions
  for each row execute function field_ops_set_updated_at();

drop trigger if exists site_inspections_updated_at on site_inspections;
create trigger site_inspections_updated_at
  before update on site_inspections
  for each row execute function field_ops_set_updated_at();

alter table training_sessions enable row level security;
alter table training_session_producers enable row level security;
alter table training_session_files enable row level security;
alter table site_inspections enable row level security;
alter table site_inspection_files enable row level security;

drop policy if exists training_sessions_select on training_sessions;
create policy training_sessions_select on training_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
    )
  );

drop policy if exists training_session_producers_select on training_session_producers;
create policy training_session_producers_select on training_session_producers
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
    )
  );

drop policy if exists training_session_files_select on training_session_files;
create policy training_session_files_select on training_session_files
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
    )
  );

drop policy if exists site_inspections_select on site_inspections;
create policy site_inspections_select on site_inspections
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
    )
  );

drop policy if exists site_inspection_files_select on site_inspection_files;
create policy site_inspection_files_select on site_inspection_files
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-sessions',
  'training-sessions',
  false,
  83886080,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspections',
  'inspections',
  false,
  83886080,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "training_sessions_storage_select" on storage.objects;
drop policy if exists "training_sessions_storage_insert" on storage.objects;
drop policy if exists "inspections_storage_select" on storage.objects;
drop policy if exists "inspections_storage_insert" on storage.objects;

create policy "training_sessions_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'training-sessions'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
  )
);

create policy "training_sessions_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'training-sessions'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'manager')
  )
);

create policy "inspections_storage_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'inspections'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'manager', 'supervisor', 'dmrv_viewer')
  )
);

create policy "inspections_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'inspections'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'manager')
  )
);
