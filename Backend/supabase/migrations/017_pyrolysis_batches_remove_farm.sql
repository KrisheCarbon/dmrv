-- Pyrolysis batches never actually needed their own farm link (the kontikki
-- producer already ties the batch to a producer; farm attribution belongs to
-- mixing/application entries downstream). Drop the unused columns.

alter table public.pyrolysis_batches
  drop column if exists farm_id;

alter table public.pyrolysis_batches
  drop column if exists farm_name;
