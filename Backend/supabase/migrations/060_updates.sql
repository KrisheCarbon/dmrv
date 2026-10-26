-- Operational updates written in the portal and delivered to the bell
-- and the field app. Audience is everyone, one role, or one person.
-- Read state is per person, so a broadcast stays unread until each recipient opens it.

create table if not exists updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null check (audience in ('all', 'role', 'user')),
  target_role text,
  target_user_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint updates_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint updates_body_length check (char_length(btrim(body)) between 1 and 2000),
  constraint updates_created_by_fkey foreign key (created_by) references users (id),
  constraint updates_target_user_id_fkey foreign key (target_user_id) references users (id),
  constraint updates_audience_shape check (
    (
      audience = 'all'
      and target_role is null
      and target_user_id is null
    )
    or (
      audience = 'role'
      and target_role in ('admin', 'manager', 'supervisor', 'climapreneur', 'dmrv_viewer')
      and target_user_id is null
    )
    or (
      audience = 'user'
      and target_user_id is not null
      and target_role is null
    )
  )
);

create index if not exists updates_created_at_idx
  on updates (created_at desc);

create index if not exists updates_created_by_idx
  on updates (created_by, created_at desc);

create index if not exists updates_target_user_idx
  on updates (target_user_id)
  where audience = 'user';

create index if not exists updates_target_role_idx
  on updates (target_role)
  where audience = 'role';

create table if not exists update_reads (
  update_id uuid not null references updates (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (update_id, user_id)
);

create index if not exists update_reads_user_idx
  on update_reads (user_id, update_id);

alter table updates enable row level security;
alter table update_reads enable row level security;

drop policy if exists updates_select_visible on updates;
create policy updates_select_visible on updates
  for select to authenticated
  using (
    audience = 'all'
    or (
      audience = 'role'
      and target_role = (
        select u.role from public.users u where u.id = (select auth.uid())
      )
    )
    or target_user_id = (select auth.uid())
    or created_by = (select auth.uid())
  );

drop policy if exists update_reads_select_own on update_reads;
create policy update_reads_select_own on update_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists update_reads_insert_own on update_reads;
create policy update_reads_insert_own on update_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.updates m
      where m.id = update_id
        and (
          m.audience = 'all'
          or (
            m.audience = 'role'
            and m.target_role = (
              select u.role from public.users u where u.id = (select auth.uid())
            )
          )
          or m.target_user_id = (select auth.uid())
        )
    )
  );
