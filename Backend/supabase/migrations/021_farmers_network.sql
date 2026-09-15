-- Farmers Network: profile columns on farms, field plots, consents, soil samples/reports.

alter table if exists farms
  add column if not exists farmer_code text,
  add column if not exists father_spouse_name text,
  add column if not exists agri_id text,
  add column if not exists village text,
  add column if not exists mandal text,
  add column if not exists district text,
  add column if not exists state text,
  add column if not exists owned_land_size numeric,
  add column if not exists leased_land_size numeric;

create table if not exists farm_fields (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms (id) on delete cascade,
  field_code text not null,
  ownership_type text not null default 'Owned',
  land_reference text,
  lease_start date,
  lease_end date,
  status text not null default 'active',
  latitude double precision,
  longitude double precision,
  boundary_geojson jsonb,
  calculated_area numeric,
  water_source text,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  crop_name text,
  season text,
  sowing_date date,
  harvest_date date,
  crop_photos jsonb not null default '[]'::jsonb,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists farm_fields_farm_idx on farm_fields (farm_id);
create index if not exists farm_fields_status_idx on farm_fields (status);

create table if not exists farmer_consents (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms (id) on delete cascade,
  agreement_type text not null default 'Farmer consent',
  consent_status text not null default 'active',
  consent_date date not null default current_date,
  valid_from date,
  valid_to date not null,
  agreement_reference text,
  photos jsonb not null default '[]'::jsonb,
  evidence_notes text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists farmer_consents_farm_idx on farmer_consents (farm_id);

create table if not exists soil_tests (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms (id) on delete cascade,
  sample_date date not null default current_date,
  sample_lat double precision,
  sample_lng double precision,
  sample_photo_url text,
  submitted_to_supervisor_id uuid references users (id),
  collected_by uuid references users (id),
  collected_by_role text,
  status text not null default 'submitted',
  received_at timestamptz,
  received_by uuid references users (id),
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists soil_tests_farm_idx on soil_tests (farm_id);
create index if not exists soil_tests_supervisor_idx on soil_tests (submitted_to_supervisor_id);
create index if not exists soil_tests_status_idx on soil_tests (status);

create table if not exists soil_test_fields (
  soil_test_id uuid not null references soil_tests (id) on delete cascade,
  farm_field_id uuid not null references farm_fields (id) on delete cascade,
  primary key (soil_test_id, farm_field_id)
);

create index if not exists soil_test_fields_field_idx on soil_test_fields (farm_field_id);

create table if not exists soil_reports (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms (id) on delete cascade,
  soil_test_id uuid references soil_tests (id) on delete set null,
  report_date date not null default current_date,
  source text,
  results_summary text,
  document_url text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists soil_reports_farm_idx on soil_reports (farm_id);
create index if not exists soil_reports_test_idx on soil_reports (soil_test_id);

create or replace function farmers_network_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists farm_fields_updated_at on farm_fields;
create trigger farm_fields_updated_at
  before update on farm_fields
  for each row execute function farmers_network_set_updated_at();

drop trigger if exists farmer_consents_updated_at on farmer_consents;
create trigger farmer_consents_updated_at
  before update on farmer_consents
  for each row execute function farmers_network_set_updated_at();

drop trigger if exists soil_tests_updated_at on soil_tests;
create trigger soil_tests_updated_at
  before update on soil_tests
  for each row execute function farmers_network_set_updated_at();

drop trigger if exists soil_reports_updated_at on soil_reports;
create trigger soil_reports_updated_at
  before update on soil_reports
  for each row execute function farmers_network_set_updated_at();

alter table farm_fields enable row level security;
alter table farmer_consents enable row level security;
alter table soil_tests enable row level security;
alter table soil_test_fields enable row level security;
alter table soil_reports enable row level security;

drop policy if exists "Authenticated users can read farm fields" on farm_fields;
drop policy if exists "Authenticated users can insert farm fields" on farm_fields;
drop policy if exists "Authenticated users can update farm fields" on farm_fields;
drop policy if exists "Authenticated users can delete farm fields" on farm_fields;

create policy "Authenticated users can read farm fields"
  on farm_fields for select to authenticated using (true);
create policy "Authenticated users can insert farm fields"
  on farm_fields for insert to authenticated with check (true);
create policy "Authenticated users can update farm fields"
  on farm_fields for update to authenticated using (true);
create policy "Authenticated users can delete farm fields"
  on farm_fields for delete to authenticated using (true);

drop policy if exists "Authenticated users can read farmer consents" on farmer_consents;
drop policy if exists "Authenticated users can insert farmer consents" on farmer_consents;
drop policy if exists "Authenticated users can update farmer consents" on farmer_consents;
drop policy if exists "Authenticated users can delete farmer consents" on farmer_consents;

create policy "Authenticated users can read farmer consents"
  on farmer_consents for select to authenticated using (true);
create policy "Authenticated users can insert farmer consents"
  on farmer_consents for insert to authenticated with check (true);
create policy "Authenticated users can update farmer consents"
  on farmer_consents for update to authenticated using (true);
create policy "Authenticated users can delete farmer consents"
  on farmer_consents for delete to authenticated using (true);

drop policy if exists "Authenticated users can read soil tests" on soil_tests;
drop policy if exists "Authenticated users can insert soil tests" on soil_tests;
drop policy if exists "Authenticated users can update soil tests" on soil_tests;
drop policy if exists "Authenticated users can delete soil tests" on soil_tests;

create policy "Authenticated users can read soil tests"
  on soil_tests for select to authenticated using (true);
create policy "Authenticated users can insert soil tests"
  on soil_tests for insert to authenticated with check (true);
create policy "Authenticated users can update soil tests"
  on soil_tests for update to authenticated using (true);
create policy "Authenticated users can delete soil tests"
  on soil_tests for delete to authenticated using (true);

drop policy if exists "Authenticated users can read soil test fields" on soil_test_fields;
drop policy if exists "Authenticated users can insert soil test fields" on soil_test_fields;
drop policy if exists "Authenticated users can delete soil test fields" on soil_test_fields;

create policy "Authenticated users can read soil test fields"
  on soil_test_fields for select to authenticated using (true);
create policy "Authenticated users can insert soil test fields"
  on soil_test_fields for insert to authenticated with check (true);
create policy "Authenticated users can delete soil test fields"
  on soil_test_fields for delete to authenticated using (true);

drop policy if exists "Authenticated users can read soil reports" on soil_reports;
drop policy if exists "Authenticated users can insert soil reports" on soil_reports;
drop policy if exists "Authenticated users can update soil reports" on soil_reports;
drop policy if exists "Authenticated users can delete soil reports" on soil_reports;

create policy "Authenticated users can read soil reports"
  on soil_reports for select to authenticated using (true);
create policy "Authenticated users can insert soil reports"
  on soil_reports for insert to authenticated with check (true);
create policy "Authenticated users can update soil reports"
  on soil_reports for update to authenticated using (true);
create policy "Authenticated users can delete soil reports"
  on soil_reports for delete to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'farmer-network-photos',
  'farmer-network-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'soil-reports',
  'soil-reports',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

drop policy if exists "farmer_network_photos_select" on storage.objects;
drop policy if exists "farmer_network_photos_insert" on storage.objects;
drop policy if exists "farmer_network_photos_update" on storage.objects;
drop policy if exists "farmer_network_photos_delete" on storage.objects;

create policy "farmer_network_photos_select"
on storage.objects for select
to authenticated
using (bucket_id = 'farmer-network-photos');

create policy "farmer_network_photos_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'farmer-network-photos');

create policy "farmer_network_photos_update"
on storage.objects for update
to authenticated
using (bucket_id = 'farmer-network-photos')
with check (bucket_id = 'farmer-network-photos');

create policy "farmer_network_photos_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'farmer-network-photos');

drop policy if exists "soil_reports_storage_select" on storage.objects;
drop policy if exists "soil_reports_storage_insert" on storage.objects;
drop policy if exists "soil_reports_storage_update" on storage.objects;
drop policy if exists "soil_reports_storage_delete" on storage.objects;

create policy "soil_reports_storage_select"
on storage.objects for select
to authenticated
using (bucket_id = 'soil-reports');

create policy "soil_reports_storage_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'soil-reports');

create policy "soil_reports_storage_update"
on storage.objects for update
to authenticated
using (bucket_id = 'soil-reports')
with check (bucket_id = 'soil-reports');

create policy "soil_reports_storage_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'soil-reports');
