-- Which carbon registry this biochar producer is listed with.
alter table biochar_producers
  add column if not exists registry text;

alter table biochar_producers
  drop constraint if exists biochar_producers_registry_check;

alter table biochar_producers
  add constraint biochar_producers_registry_check
  check (registry is null or registry in ('csi', 'rainbow', 'both'));

comment on column biochar_producers.registry is
  'Carbon registry this producer belongs to: CSI, Rainbow, or both.';
