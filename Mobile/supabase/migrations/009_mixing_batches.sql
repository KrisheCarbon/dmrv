-- Mixing entries + pyrolysis batch links + photo storage bucket.

create table if not exists mixing_entries (
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
    check (status in ('draft', 'submitted', 'synced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mixing_pyrolysis_links (
  mixing_entry_id uuid not null references mixing_entries (id) on delete cascade,
  pyrolysis_batch_id uuid not null references pyrolysis_batches (id),
  kontikki_code text,
  batch_number text,
  producer_name text,
  primary key (mixing_entry_id, pyrolysis_batch_id)
);

create index if not exists mixing_entries_operator_idx on mixing_entries (operator_id);
create index if not exists mixing_entries_started_at_idx on mixing_entries (started_at desc);
create index if not exists mixing_pyrolysis_links_batch_idx on mixing_pyrolysis_links (pyrolysis_batch_id);

create or replace function mixing_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mixing_entries_updated_at on mixing_entries;
create trigger mixing_entries_updated_at
  before update on mixing_entries
  for each row execute function mixing_set_updated_at();

alter table mixing_entries enable row level security;
alter table mixing_pyrolysis_links enable row level security;

drop policy if exists mixing_entries_select_own on mixing_entries;
create policy mixing_entries_select_own on mixing_entries
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists mixing_entries_insert_own on mixing_entries;
create policy mixing_entries_insert_own on mixing_entries
  for insert to authenticated with check (operator_id = auth.uid());

drop policy if exists mixing_entries_update_own on mixing_entries;
create policy mixing_entries_update_own on mixing_entries
  for update to authenticated using (operator_id = auth.uid());

drop policy if exists mixing_pyrolysis_links_select on mixing_pyrolysis_links;
create policy mixing_pyrolysis_links_select on mixing_pyrolysis_links
  for select to authenticated
  using (exists (
    select 1 from mixing_entries m
    where m.id = mixing_entry_id and m.operator_id = auth.uid()
  ));

drop policy if exists mixing_pyrolysis_links_insert on mixing_pyrolysis_links;
create policy mixing_pyrolysis_links_insert on mixing_pyrolysis_links
  for insert to authenticated
  with check (exists (
    select 1 from mixing_entries m
    where m.id = mixing_entry_id and m.operator_id = auth.uid()
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mixing',
  'mixing',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mixing_storage_select" on storage.objects;
drop policy if exists "mixing_storage_insert" on storage.objects;
drop policy if exists "mixing_storage_update" on storage.objects;
drop policy if exists "mixing_storage_delete" on storage.objects;

create policy "mixing_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'mixing');

create policy "mixing_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'mixing');

create policy "mixing_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'mixing')
with check (bucket_id = 'mixing');

create policy "mixing_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'mixing');
