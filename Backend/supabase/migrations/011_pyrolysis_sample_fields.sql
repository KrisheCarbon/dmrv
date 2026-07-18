-- Pyrolysis batch sample ID + photo captured after yield.

alter table pyrolysis_batches
  add column if not exists sample_id text,
  add column if not exists sample_photo_url text,
  add column if not exists sample_photo_metadata jsonb,
  add column if not exists sample_saved_at timestamptz;
