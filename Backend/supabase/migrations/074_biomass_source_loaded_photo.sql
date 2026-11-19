-- Each farm on a biomass trip has its own photo of the tractor being loaded.
-- The API writes through PostgREST as web_anon. That role already has table
-- access; the grant below covers a database where the table grant is missing.

alter table biomass_collection_sources
  add column if not exists loaded_photo_url text;

alter table biomass_collection_sources
  add column if not exists loaded_photo_metadata jsonb;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_anon') then
    execute 'grant select, insert, update, delete on biomass_collection_sources to web_anon';
  end if;
end $$;

notify pgrst, 'reload schema';
