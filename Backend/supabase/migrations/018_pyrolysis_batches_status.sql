-- Lets an operator submit kontikkis within a pyrolysis batch one at a time
-- instead of all-or-nothing. A "draft" batch still reserves its kontikki for
-- the active session; a "submitted" batch is finalized and no longer blocks
-- that kontikki from being picked for a new session.
--
-- Named `submission_status` (not `batch_status`) to avoid clashing with the
-- existing `pyrolysis_batch_status` review/approval relation.
alter table public.pyrolysis_batches
  add column if not exists submission_status text not null default 'draft';

alter table public.pyrolysis_batches
  drop constraint if exists pyrolysis_batches_submission_status_check;

alter table public.pyrolysis_batches
  add constraint pyrolysis_batches_submission_status_check
  check (submission_status in ('draft', 'submitted'));

create index if not exists idx_pyrolysis_batches_submission_status
  on public.pyrolysis_batches (submission_status);
