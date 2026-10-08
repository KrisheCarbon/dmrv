-- Corn needs 12 moisture readings, and a kiln can take more layers than that.
-- The original check stopped at 10.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'rainbow_pyrolysis_moisture'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%slot%'
  loop
    execute format(
      'alter table rainbow_pyrolysis_moisture drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

alter table rainbow_pyrolysis_moisture
  drop constraint if exists rainbow_pyrolysis_moisture_slot_check;

alter table rainbow_pyrolysis_moisture
  add constraint rainbow_pyrolysis_moisture_slot_check
  check (slot >= 1);

comment on table rainbow_pyrolysis_moisture is
  'One moisture reading per biomass layer. Cotton needs at least 10 and corn at least 12.';
