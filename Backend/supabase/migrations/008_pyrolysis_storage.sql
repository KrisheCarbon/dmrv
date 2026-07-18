-- Pyrolysis photo storage bucket for field batch uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pyrolysis',
  'pyrolysis',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pyrolysis_storage_select" on storage.objects;
drop policy if exists "pyrolysis_storage_insert" on storage.objects;
drop policy if exists "pyrolysis_storage_update" on storage.objects;
drop policy if exists "pyrolysis_storage_delete" on storage.objects;

create policy "pyrolysis_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'pyrolysis');

create policy "pyrolysis_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'pyrolysis');

create policy "pyrolysis_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'pyrolysis')
with check (bucket_id = 'pyrolysis');

create policy "pyrolysis_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'pyrolysis');
