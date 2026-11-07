-- The upload time is the server clock at the moment a field record first
-- arrives. A client-supplied value is not kept.
-- Kiln runs keep their own rule: uploaded_at is set when the run is submitted.

create or replace function stamp_uploaded_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or old.uploaded_at is null then
    new.uploaded_at = now();
  else
    new.uploaded_at = old.uploaded_at;
  end if;
  return new;
end;
$$;

do $stamp_upload_times$
declare
  rel text;
  tables text[] := array[
    'farms',
    'farm_fields',
    'farmer_consents',
    'soil_tests',
    'soil_reports',
    'biomass_collections',
    'csi_mixing_entries',
    'rainbow_mixing_entries',
    'application_entries',
    'csi_pyrolysis_sessions',
    'rainbow_pyrolysis_sessions',
    'kiln_batches'
  ];
begin
  foreach rel in array tables loop
    if to_regclass('public.' || rel) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists uploaded_at timestamptz',
      rel
    );
    execute format(
      'comment on column public.%I.uploaded_at is %L',
      rel,
      'Server time when this record was first uploaded. Not taken from the phone.'
    );
    execute format('drop trigger if exists stamp_uploaded_at on public.%I', rel);
    execute format(
      'create trigger stamp_uploaded_at before insert or update on public.%I for each row execute function stamp_uploaded_at()',
      rel
    );
  end loop;
end
$stamp_upload_times$;

create table if not exists device_clock_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  checked_at timestamptz not null default now(),
  device_time timestamptz,
  gnss_time timestamptz,
  server_time timestamptz not null,
  offset_ms integer,
  time_source text not null,
  clock_skew_detected boolean not null,
  reason text
);

create index if not exists device_clock_checks_user_checked
  on device_clock_checks (user_id, checked_at desc);

comment on table device_clock_checks is
  'Phone clock compared with the server clock and, when a kiln sensor has a fix, GNSS time.';
