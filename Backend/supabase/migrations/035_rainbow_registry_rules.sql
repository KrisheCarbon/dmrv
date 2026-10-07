-- Rainbow kiln runs follow the distributed-kiln methodology:
-- one moisture reading per 100 kg (minimum 10), a photo of every
-- biomass layer, a flame-curtain photo after the last layer, and
-- quench start/end photos. Rainbow farmers record that this
-- project holds the sole right to issue credits.
-- Run after 034, which names the CSI tables and creates the Rainbow
-- session and mixing tables.

alter table rainbow_pyrolysis_moisture
  drop constraint if exists rainbow_pyrolysis_moisture_slot_check;

alter table rainbow_pyrolysis_moisture
  add constraint rainbow_pyrolysis_moisture_slot_check
  check (slot >= 1);

alter table rainbow_pyrolysis_batches
  add column if not exists feedstock_class text
    check (feedstock_class is null or feedstock_class in ('woody', 'other'));

alter table rainbow_pyrolysis_batches
  add column if not exists last_layer_confirmed boolean not null default false;

alter table rainbow_pyrolysis_batches
  add column if not exists flame_curtain_photo_url text;

alter table rainbow_pyrolysis_batches
  add column if not exists flame_curtain_photo_metadata jsonb;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_start_photo_url text;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_start_photo_metadata jsonb;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_end_photo_url text;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_end_photo_metadata jsonb;

alter table farms
  add column if not exists credit_rights_acknowledged boolean not null default false;

comment on column farms.credit_rights_acknowledged is
  'Rainbow producers: the farmer agrees this project holds the sole right to issue carbon credits for biochar from this farm.';
