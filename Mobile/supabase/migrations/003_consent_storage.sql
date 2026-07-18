-- Module storage buckets + RLS for authenticated field agents.
-- Run in Supabase SQL editor if not applied via CLI.
--
-- Each module is its own bucket (not grouped under consent-documents):
--   farms/consent-documents/...
--   pyrolysis/...                         (add when that module ships)
--   mixing/...
--   trainings/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'farms',
  'farms',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "farms_storage_select" on storage.objects;
drop policy if exists "farms_storage_insert" on storage.objects;
drop policy if exists "farms_storage_update" on storage.objects;
drop policy if exists "farms_storage_delete" on storage.objects;

create policy "farms_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'farms');

create policy "farms_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'farms');

create policy "farms_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'farms')
with check (bucket_id = 'farms');

create policy "farms_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'farms');
