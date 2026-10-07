-- Quench proof can be several timestamped photos or one short video.
-- Photo length is the gap between the first and last watermark times.

alter table rainbow_pyrolysis_batches
  add column if not exists quench_photos jsonb not null default '[]'::jsonb;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_video_url text;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_video_metadata jsonb;

alter table rainbow_pyrolysis_batches
  add column if not exists quench_video_duration_seconds numeric;

comment on column rainbow_pyrolysis_batches.quench_photos is
  'Ordered quench photos. Each photo_metadata.captured_at is the time printed on the watermark.';
