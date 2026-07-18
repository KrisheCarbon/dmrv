-- Application entries + pyrolysis batch links + review status + media storage.

create table if not exists application_entries (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references users (id),
  applied_at timestamptz not null,
  farm_id uuid references farms (id),
  farm_name text,
  comment text,
  media_type text not null check (media_type in ('photo', 'video')),
  media_url text,
  media_metadata jsonb,
  status text not null default 'submitted'
    check (status in ('submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_pyrolysis_links (
  application_entry_id uuid not null references application_entries (id) on delete cascade,
  pyrolysis_batch_id uuid not null references pyrolysis_batches (id),
  kontikki_code text,
  batch_number text,
  producer_name text,
  primary key (application_entry_id, pyrolysis_batch_id)
);

create table if not exists application_entry_status (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references application_entries (id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'on_hold')),
  reviewer_notes text,
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_entry_media_flags (
  id uuid primary key default gen_random_uuid(),
  entry_status_id uuid not null references application_entry_status (id) on delete cascade,
  media_key text not null default 'application' check (media_key in ('application')),
  flagged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_status_id, media_key)
);

create index if not exists application_entries_operator_idx on application_entries (operator_id);
create index if not exists application_entries_applied_at_idx on application_entries (applied_at desc);
create index if not exists application_pyrolysis_links_batch_idx
  on application_pyrolysis_links (pyrolysis_batch_id);
create index if not exists application_entry_status_entry_idx on application_entry_status (entry_id);

drop trigger if exists application_entries_updated_at on application_entries;
create trigger application_entries_updated_at
  before update on application_entries
  for each row execute function mixing_set_updated_at();

drop trigger if exists application_entry_status_updated_at on application_entry_status;
create trigger application_entry_status_updated_at
  before update on application_entry_status
  for each row execute function mixing_set_updated_at();

drop trigger if exists application_entry_media_flags_updated_at on application_entry_media_flags;
create trigger application_entry_media_flags_updated_at
  before update on application_entry_media_flags
  for each row execute function mixing_set_updated_at();

alter table application_entries enable row level security;
alter table application_pyrolysis_links enable row level security;
alter table application_entry_status enable row level security;
alter table application_entry_media_flags enable row level security;

drop policy if exists application_entries_select_own on application_entries;
create policy application_entries_select_own on application_entries
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists application_entries_insert_own on application_entries;
create policy application_entries_insert_own on application_entries
  for insert to authenticated with check (operator_id = auth.uid());

drop policy if exists application_pyrolysis_links_select on application_pyrolysis_links;
create policy application_pyrolysis_links_select on application_pyrolysis_links
  for select to authenticated
  using (exists (
    select 1 from application_entries a
    where a.id = application_entry_id and a.operator_id = auth.uid()
  ));

drop policy if exists application_pyrolysis_links_insert on application_pyrolysis_links;
create policy application_pyrolysis_links_insert on application_pyrolysis_links
  for insert to authenticated
  with check (exists (
    select 1 from application_entries a
    where a.id = application_entry_id and a.operator_id = auth.uid()
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application',
  'application',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "application_storage_select" on storage.objects;
drop policy if exists "application_storage_insert" on storage.objects;
drop policy if exists "application_storage_update" on storage.objects;
drop policy if exists "application_storage_delete" on storage.objects;

create policy "application_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'application');

create policy "application_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'application');

create policy "application_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'application')
with check (bucket_id = 'application');

create policy "application_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'application');
