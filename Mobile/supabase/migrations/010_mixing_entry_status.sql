-- Mixing entry review status + photo flags.

create table if not exists mixing_entry_status (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references mixing_entries (id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'on_hold')),
  reviewer_notes text,
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mixing_entry_photo_flags (
  id uuid primary key default gen_random_uuid(),
  entry_status_id uuid not null references mixing_entry_status (id) on delete cascade,
  photo_key text not null check (photo_key in ('biochar', 'substrate', 'mixing')),
  flagged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_status_id, photo_key)
);

create index if not exists mixing_entry_status_entry_idx
  on mixing_entry_status (entry_id);
create index if not exists mixing_entry_status_status_idx
  on mixing_entry_status (status);
create index if not exists mixing_entry_photo_flags_status_idx
  on mixing_entry_photo_flags (entry_status_id);

drop trigger if exists mixing_entry_status_updated_at on mixing_entry_status;
create trigger mixing_entry_status_updated_at
  before update on mixing_entry_status
  for each row execute function mixing_set_updated_at();

drop trigger if exists mixing_entry_photo_flags_updated_at on mixing_entry_photo_flags;
create trigger mixing_entry_photo_flags_updated_at
  before update on mixing_entry_photo_flags
  for each row execute function mixing_set_updated_at();

alter table mixing_entry_status enable row level security;
alter table mixing_entry_photo_flags enable row level security;

alter table mixing_entries drop constraint if exists mixing_entries_status_check;
update mixing_entries
set status = 'submitted'
where status in ('draft', 'synced');
alter table mixing_entries
  add constraint mixing_entries_status_check
  check (status in ('submitted'));

insert into mixing_entry_status (entry_id, status)
select id, 'pending_review'
from mixing_entries
on conflict (entry_id) do nothing;
