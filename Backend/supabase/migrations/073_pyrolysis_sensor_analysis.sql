-- One saved reading of the kiln temperature curve for a production entry.
-- The portal writes this once. Later opens show the stored JSON.

create table if not exists pyrolysis_sensor_analyses (
  batch_id uuid primary key,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

comment on table pyrolysis_sensor_analyses is
  'Curve analysis saved once per pyrolysis batch: peaks, dips, and the quench drop.';

alter table rainbow_pyrolysis_batches
  add column if not exists sensor_analysis jsonb;

alter table csi_pyrolysis_batches
  add column if not exists sensor_analysis jsonb;

comment on column rainbow_pyrolysis_batches.sensor_analysis is
  'Same JSON as pyrolysis_sensor_analyses.analysis, copied when the batch row is in this database.';

comment on column csi_pyrolysis_batches.sensor_analysis is
  'Same JSON as pyrolysis_sensor_analyses.analysis, copied when the batch row is in this database.';

alter table pyrolysis_sensor_analyses enable row level security;

revoke all on table pyrolysis_sensor_analyses from anon, authenticated;
grant select, insert, update on table pyrolysis_sensor_analyses to service_role;
