-- Pyrolysis module: database tables + storage bucket + RLS.
-- Run in Supabase SQL editor (Dashboard → SQL → New query).
--
-- ATOMICITY MODEL
-- ----------------
-- • pyrolysis_sessions = aggregate root (one batch run).
-- • pyrolysis_session_kontikkis = one row per kontikki; all form JSON lives in `data`.
-- • pyrolysis_kontikki_locks = exclusive lock per kontikki for active batches.
-- • Starting a batch: backend inserts session + children + locks in one flow (rollback on conflict).
-- • Saving a section: one PATCH updates a single kontikki row (data + completion flags) atomically.
-- • Mobile mirrors this: each save = one WatermelonDB transaction; photos upload then URL merged into `data`.
-- • Multiple sync queue items are OK — each kontikki save is idempotent PATCH by (session_id, kontikki_id).

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists pyrolysis_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references users (id),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  current_step text not null default 'info'
    check (current_step in ('select', 'info', 'moisture', 'pyrolysis', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists pyrolysis_session_kontikkis (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references pyrolysis_sessions (id) on delete cascade,
  kontikki_id uuid not null references kontikkis (id),
  kontikki_code text not null,
  data jsonb not null default '{}'::jsonb,
  info_completed boolean not null default false,
  moisture_completed boolean not null default false,
  pyrolysis_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, kontikki_id)
);

create table if not exists pyrolysis_kontikki_locks (
  kontikki_id uuid primary key references kontikkis (id) on delete cascade,
  session_id uuid not null references pyrolysis_sessions (id) on delete cascade,
  locked_by uuid not null references users (id),
  locked_at timestamptz not null default now()
);

create index if not exists pyrolysis_sessions_operator_idx
  on pyrolysis_sessions (operator_id);
create index if not exists pyrolysis_sessions_status_idx
  on pyrolysis_sessions (status);
create index if not exists pyrolysis_session_kontikkis_session_idx
  on pyrolysis_session_kontikkis (session_id);
create index if not exists pyrolysis_session_kontikkis_kontikki_idx
  on pyrolysis_session_kontikkis (kontikki_id);
create index if not exists pyrolysis_kontikki_locks_session_idx
  on pyrolysis_kontikki_locks (session_id);

-- Auto-update updated_at
create or replace function pyrolysis_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pyrolysis_sessions_updated_at on pyrolysis_sessions;
create trigger pyrolysis_sessions_updated_at
  before update on pyrolysis_sessions
  for each row execute function pyrolysis_set_updated_at();

drop trigger if exists pyrolysis_session_kontikkis_updated_at on pyrolysis_session_kontikkis;
create trigger pyrolysis_session_kontikkis_updated_at
  before update on pyrolysis_session_kontikkis
  for each row execute function pyrolysis_set_updated_at();

-- ── Row level security (authenticated users; backend uses service role) ───────

alter table pyrolysis_sessions enable row level security;
alter table pyrolysis_session_kontikkis enable row level security;
alter table pyrolysis_kontikki_locks enable row level security;

drop policy if exists pyrolysis_sessions_select_own on pyrolysis_sessions;
create policy pyrolysis_sessions_select_own on pyrolysis_sessions
  for select to authenticated
  using (operator_id = auth.uid());

drop policy if exists pyrolysis_session_kontikkis_select on pyrolysis_session_kontikkis;
create policy pyrolysis_session_kontikkis_select on pyrolysis_session_kontikkis
  for select to authenticated
  using (
    exists (
      select 1 from pyrolysis_sessions s
      where s.id = session_id and s.operator_id = auth.uid()
    )
  );

drop policy if exists pyrolysis_kontikki_locks_select on pyrolysis_kontikki_locks;
create policy pyrolysis_kontikki_locks_select on pyrolysis_kontikki_locks
  for select to authenticated
  using (locked_by = auth.uid());

-- ── Storage bucket: pyrolysis ─────────────────────────────────────────────────
-- Path layout (mobile uploads):
--   sessions/{session_id}/kontikkis/{kontikki_id}/feedstock.jpg
--   sessions/{session_id}/kontikkis/{kontikki_id}/moisture/1.jpg
--   sessions/{session_id}/kontikkis/{kontikki_id}/stages/initial.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pyrolysis',
  'pyrolysis',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pyrolysis_storage_select on storage.objects;
drop policy if exists pyrolysis_storage_insert on storage.objects;
drop policy if exists pyrolysis_storage_update on storage.objects;
drop policy if exists pyrolysis_storage_delete on storage.objects;

create policy pyrolysis_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'pyrolysis');

create policy pyrolysis_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pyrolysis');

create policy pyrolysis_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'pyrolysis')
  with check (bucket_id = 'pyrolysis');

create policy pyrolysis_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pyrolysis');
