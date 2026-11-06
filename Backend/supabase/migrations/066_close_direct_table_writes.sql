-- A signed-in user could insert, update, or delete these tables through the
-- Data API. The policies allowed every authenticated user, or every role.
-- The API does not use that path: on Supabase it uses the service role, which
-- bypasses row security, and on AWS it uses web_anon. Select policies stay.
-- The public ROI form still inserts as anon. That policy is left in place.

do $drop_open_writes$
declare
  rec record;
  role_list text;
begin
  for rec in
    select n.nspname as schema_name,
           c.relname as table_name,
           pol.polname as policy_name,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') as using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), 'true') as check_expr,
           pol.polroles
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and pol.polcmd in ('a', 'w', 'd', '*')
  loop
    if rec.using_expr <> 'true' or rec.check_expr <> 'true' then
      continue;
    end if;

    select coalesce(string_agg(r.rolname, ','), 'PUBLIC')
      into role_list
    from pg_roles r
    where r.oid = any (rec.polroles);

    -- anon is the public website form, not a signed-in portal user.
    if role_list = 'anon' then
      continue;
    end if;
    if role_list <> 'PUBLIC' and position('authenticated' in role_list) = 0 then
      continue;
    end if;

    execute format(
      'drop policy %I on %I.%I',
      rec.policy_name,
      rec.schema_name,
      rec.table_name
    );
  end loop;
end
$drop_open_writes$;

do $revoke_writes$
declare
  rel text;
  tables text[] := array[
    'biochar_producer_clusters',
    'climapreneur_bank_accounts',
    'cluster_climapreneurs',
    'cluster_supervisors',
    'cluster_villages',
    'clusters',
    'farm_fields',
    'farmer_consents',
    'feedstocks',
    'kiln_batches',
    'kiln_temperature_readings',
    'soil_reports',
    'soil_test_fields',
    'soil_tests',
    'training_records'
  ];
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;

  foreach rel in array tables loop
    if to_regclass('public.' || rel) is null then
      continue;
    end if;
    execute format(
      'revoke insert, update, delete on table public.%I from authenticated',
      rel
    );
  end loop;
end
$revoke_writes$;

-- PostgREST on AWS writes as web_anon and does not bypass row security.
-- The kiln policies it was using applied to every role. Replace them with
-- a policy for the API role only.
do $api_kiln_write$
declare
  bypass boolean;
begin
  select rolbypassrls into bypass from pg_roles where rolname = 'web_anon';
  if not found or bypass then
    return;
  end if;

  if to_regclass('public.kiln_batches') is not null then
    execute 'drop policy if exists kiln_batches_api_write on public.kiln_batches';
    execute 'create policy kiln_batches_api_write on public.kiln_batches for all to web_anon using (true) with check (true)';
  end if;

  if to_regclass('public.kiln_temperature_readings') is not null then
    execute 'drop policy if exists kiln_temperature_readings_api_write on public.kiln_temperature_readings';
    execute 'create policy kiln_temperature_readings_api_write on public.kiln_temperature_readings for all to web_anon using (true) with check (true)';
  end if;
end
$api_kiln_write$;
