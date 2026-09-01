-- Field training records (Operations → Trainings).

create table if not exists training_records (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references users (id),
  biochar_producer_id uuid references biochar_producers (id) on delete set null,
  producer_site_id uuid references producer_sites (id) on delete set null,
  certificate_url text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_records_location_check check (
    biochar_producer_id is not null or producer_site_id is not null
  )
);

create index if not exists training_records_supervisor_idx
  on training_records (supervisor_id);

create index if not exists training_records_producer_idx
  on training_records (biochar_producer_id);

create index if not exists training_records_site_idx
  on training_records (producer_site_id);

create or replace function training_records_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_records_updated_at on training_records;
create trigger training_records_updated_at
  before update on training_records
  for each row execute function training_records_set_updated_at();

alter table training_records enable row level security;

create policy "Authenticated users can read training records"
  on training_records
  for select
  to authenticated
  using (true);

create policy "Authenticated users can insert training records"
  on training_records
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update training records"
  on training_records
  for update
  to authenticated
  using (true);

create policy "Authenticated users can delete training records"
  on training_records
  for delete
  to authenticated
  using (true);

-- ── Storage bucket: trainings ─────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trainings',
  'trainings',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

drop policy if exists "trainings_storage_select" on storage.objects;
drop policy if exists "trainings_storage_insert" on storage.objects;
drop policy if exists "trainings_storage_update" on storage.objects;
drop policy if exists "trainings_storage_delete" on storage.objects;

create policy "trainings_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'trainings');

create policy "trainings_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'trainings');

create policy "trainings_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'trainings')
with check (bucket_id = 'trainings');

create policy "trainings_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'trainings');
