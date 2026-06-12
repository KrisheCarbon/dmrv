-- Consent documents storage bucket + RLS for authenticated field agents.
-- Run in Supabase SQL editor if not applied via CLI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consent-documents',
  'consent-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "consent_documents_select" on storage.objects;
drop policy if exists "consent_documents_insert" on storage.objects;
drop policy if exists "consent_documents_update" on storage.objects;
drop policy if exists "consent_documents_delete" on storage.objects;

create policy "consent_documents_select"
on storage.objects for select
to authenticated
using (bucket_id = 'consent-documents');

create policy "consent_documents_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'consent-documents');

create policy "consent_documents_update"
on storage.objects for update
to authenticated
using (bucket_id = 'consent-documents')
with check (bucket_id = 'consent-documents');

create policy "consent_documents_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'consent-documents');
