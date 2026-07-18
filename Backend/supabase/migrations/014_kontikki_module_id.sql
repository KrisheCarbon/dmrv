-- Link kontikkis to ESP32 kiln hardware via the KILN_ID BLE characteristic value.
alter table kontikkis
  add column if not exists module_id text;

create unique index if not exists kontikkis_module_id_unique_idx
  on kontikkis (module_id)
  where module_id is not null;

comment on column kontikkis.module_id is
  'ESP32 KILN_ID characteristic value (e.g. Kiln-ESP32). Mobile users with kontikki access connect to hardware matching this ID.';

-- Associate decrypted kiln batches with the registered kontikki unit.
alter table kiln_batches
  add column if not exists kontikki_id uuid references kontikkis (id);

create index if not exists kiln_batches_kontikki_id_idx
  on kiln_batches (kontikki_id);
