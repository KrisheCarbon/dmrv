-- A pyrolysis batch can only ever be mixed once. Enforce this at the
-- database level (in addition to the application-level check) so a race
-- between two mixing entries can never link the same batch twice.
create unique index if not exists mixing_pyrolysis_links_batch_unique
  on public.mixing_pyrolysis_links (pyrolysis_batch_id);
