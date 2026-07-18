-- Pyrolysis batch status: one status row per batch + per-section / per-photo flags.

create table if not exists pyrolysis_batch_status (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references pyrolysis_batches (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'on_hold')),
  reviewer_notes text,
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pyrolysis_batch_status_flags (
  id uuid primary key default gen_random_uuid(),
  batch_status_id uuid not null references pyrolysis_batch_status (id) on delete cascade,
  target_type text not null check (target_type in ('section', 'photo')),
  target_key text not null,
  status text not null check (status in ('accepted', 'rejected', 'on_hold')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_status_id, target_type, target_key)
);

create index if not exists pyrolysis_batch_status_batch_idx
  on pyrolysis_batch_status (batch_id);
create index if not exists pyrolysis_batch_status_status_idx
  on pyrolysis_batch_status (status);
create index if not exists pyrolysis_batch_status_flags_batch_status_idx
  on pyrolysis_batch_status_flags (batch_status_id);

drop trigger if exists pyrolysis_batch_status_updated_at on pyrolysis_batch_status;
create trigger pyrolysis_batch_status_updated_at
  before update on pyrolysis_batch_status
  for each row execute function pyrolysis_set_updated_at();

drop trigger if exists pyrolysis_batch_status_flags_updated_at on pyrolysis_batch_status_flags;
create trigger pyrolysis_batch_status_flags_updated_at
  before update on pyrolysis_batch_status_flags
  for each row execute function pyrolysis_set_updated_at();

alter table pyrolysis_batch_status enable row level security;
alter table pyrolysis_batch_status_flags enable row level security;
