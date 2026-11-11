-- Farmer and farm saves were rejected with
-- "Could not find the 'edit_history' column of 'farms' in the schema cache".
-- The column may already exist. This makes it visible to the API role and
-- reloads PostgREST so the entered farmer and farm values can be stored.
-- Existing rows keep their data. The new column starts as an empty list.

alter table farms
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

alter table farm_fields
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

alter table soil_tests
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_anon') then
    execute 'grant select, insert, update, delete on farms to web_anon';
    execute 'grant select, insert, update, delete on farm_fields to web_anon';
    execute 'grant select, insert, update, delete on soil_tests to web_anon';
  end if;
end $$;

notify pgrst, 'reload schema';
