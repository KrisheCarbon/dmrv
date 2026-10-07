-- Rainbow open-kiln runs must record the kiln itself: the permanent
-- mark and the cone. The hardware module id identifies the sensor,
-- not the kiln body.

alter table rainbow_pyrolysis_batches
  add column if not exists kiln_photo_url text;

alter table rainbow_pyrolysis_batches
  add column if not exists kiln_photo_metadata jsonb;

comment on column rainbow_pyrolysis_batches.kiln_photo_url is
  'Photo of the kiln at the start of the run, showing the permanent mark and the cone.';
