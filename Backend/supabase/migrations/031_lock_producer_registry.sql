-- Registry is chosen once at producer registration. CSI and Rainbow store
-- production evidence in different tables, so switching later would mix data.
create or replace function biochar_producers_lock_registry()
returns trigger
language plpgsql
as $$
begin
  if old.registry is not null and new.registry is distinct from old.registry then
    raise exception 'Producer registry cannot be changed after it is set.';
  end if;
  return new;
end;
$$;

drop trigger if exists biochar_producers_lock_registry on biochar_producers;
create trigger biochar_producers_lock_registry
  before update on biochar_producers
  for each row
  execute function biochar_producers_lock_registry();

comment on column biochar_producers.registry is
  'Carbon registry for this producer: CSI or Rainbow. Set once at registration and cannot be changed.';
