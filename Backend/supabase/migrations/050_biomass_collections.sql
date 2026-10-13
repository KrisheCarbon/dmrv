-- Biomass collection: a tractor load photographed at the farm, then unloaded at the production site.

create table if not exists biomass_collections (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references users (id),
  farm_id uuid references farms (id),
  farm_name text,
  producer_id uuid references biochar_producers (id),
  producer_name text,
  tractor_number text,
  loaded_at timestamptz not null,
  loaded_photo_url text not null,
  loaded_photo_metadata jsonb,
  unloaded_at timestamptz not null,
  unloaded_photo_url text not null,
  unloaded_photo_metadata jsonb,
  status text not null default 'submitted' check (status in ('submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists biomass_collections_operator_idx on biomass_collections (operator_id);
create index if not exists biomass_collections_loaded_at_idx on biomass_collections (loaded_at desc);
create index if not exists biomass_collections_farm_idx on biomass_collections (farm_id);
create index if not exists biomass_collections_producer_idx on biomass_collections (producer_id);

drop trigger if exists biomass_collections_updated_at on biomass_collections;
create trigger biomass_collections_updated_at
  before update on biomass_collections
  for each row execute function mixing_set_updated_at();

alter table biomass_collections enable row level security;

drop policy if exists biomass_collections_select_own on biomass_collections;
create policy biomass_collections_select_own on biomass_collections
  for select to authenticated using (operator_id = auth.uid());

drop policy if exists biomass_collections_insert_own on biomass_collections;
create policy biomass_collections_insert_own on biomass_collections
  for insert to authenticated with check (operator_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'biomass-collection',
  'biomass-collection',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "biomass_collection_storage_select" on storage.objects;
drop policy if exists "biomass_collection_storage_insert" on storage.objects;
drop policy if exists "biomass_collection_storage_update" on storage.objects;

create policy "biomass_collection_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'biomass-collection');

create policy "biomass_collection_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'biomass-collection');

create policy "biomass_collection_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'biomass-collection')
with check (bucket_id = 'biomass-collection');
