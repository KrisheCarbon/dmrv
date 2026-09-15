-- Remove the farmer consent form feature entirely: drop the column on
-- public.farms and tear down the "farms" storage bucket (which only ever
-- held consent-documents/*).

alter table public.farms
  drop column if exists consent_document_url;

delete from storage.objects where bucket_id = 'farms';

drop policy if exists "farms_storage_select" on storage.objects;
drop policy if exists "farms_storage_insert" on storage.objects;
drop policy if exists "farms_storage_update" on storage.objects;
drop policy if exists "farms_storage_delete" on storage.objects;

delete from storage.buckets where id = 'farms';
