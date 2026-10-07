-- Provisional Rainbow quantity: an admin volume percent of the kiln,
-- used with kiln capacity and the feedstock biochar bulk density.
-- This is an estimate until Rainbow confirms the measurement method.

alter table rainbow_pyrolysis_batches
  add column if not exists volume_percent numeric;

comment on column rainbow_pyrolysis_batches.volume_percent is
  'Estimated percent of the kiln filled with biochar. Not a weighed mass.';
