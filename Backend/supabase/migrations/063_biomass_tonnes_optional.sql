-- Estimated biomass tonnes can be left blank on a collection line.

do $$
declare
  constraint_name text;
begin
  alter table biomass_collection_sources
    alter column biomass_tonnes drop not null;

  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att
      on att.attrelid = rel.oid
     and att.attnum = any (con.conkey)
    where rel.relname = 'biomass_collection_sources'
      and con.contype = 'c'
      and att.attname = 'biomass_tonnes'
  loop
    execute format(
      'alter table biomass_collection_sources drop constraint %I',
      constraint_name
    );
  end loop;

  alter table biomass_collection_sources
    drop constraint if exists biomass_collection_sources_biomass_tonnes_positive;

  alter table biomass_collection_sources
    add constraint biomass_collection_sources_biomass_tonnes_positive
    check (biomass_tonnes is null or biomass_tonnes > 0);
end $$;

notify pgrst, 'reload schema';
