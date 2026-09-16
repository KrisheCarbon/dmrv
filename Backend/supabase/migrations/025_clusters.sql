-- Clusters: a named work area with villages and assigned field staff.

create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clusters_name_idx on clusters (name);

create table if not exists cluster_villages (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references clusters (id) on delete cascade,
  village_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists cluster_villages_cluster_idx
  on cluster_villages (cluster_id);

create unique index if not exists cluster_villages_unique_name_idx
  on cluster_villages (cluster_id, lower(village_name));

create table if not exists cluster_supervisors (
  cluster_id uuid not null references clusters (id) on delete cascade,
  supervisor_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cluster_id, supervisor_id)
);

create index if not exists cluster_supervisors_user_idx
  on cluster_supervisors (supervisor_id);

create table if not exists cluster_climapreneurs (
  cluster_id uuid not null references clusters (id) on delete cascade,
  climapreneur_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cluster_id, climapreneur_id)
);

create index if not exists cluster_climapreneurs_user_idx
  on cluster_climapreneurs (climapreneur_id);

create or replace function clusters_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clusters_updated_at on clusters;
create trigger clusters_updated_at
  before update on clusters
  for each row execute function clusters_set_updated_at();

alter table clusters enable row level security;
alter table cluster_villages enable row level security;
alter table cluster_supervisors enable row level security;
alter table cluster_climapreneurs enable row level security;

drop policy if exists "Authenticated users can read clusters" on clusters;
drop policy if exists "Authenticated users can insert clusters" on clusters;
drop policy if exists "Authenticated users can update clusters" on clusters;
drop policy if exists "Authenticated users can delete clusters" on clusters;

create policy "Authenticated users can read clusters"
  on clusters for select to authenticated using (true);
create policy "Authenticated users can insert clusters"
  on clusters for insert to authenticated with check (true);
create policy "Authenticated users can update clusters"
  on clusters for update to authenticated using (true);
create policy "Authenticated users can delete clusters"
  on clusters for delete to authenticated using (true);

drop policy if exists "Authenticated users can read cluster villages" on cluster_villages;
drop policy if exists "Authenticated users can insert cluster villages" on cluster_villages;
drop policy if exists "Authenticated users can update cluster villages" on cluster_villages;
drop policy if exists "Authenticated users can delete cluster villages" on cluster_villages;

create policy "Authenticated users can read cluster villages"
  on cluster_villages for select to authenticated using (true);
create policy "Authenticated users can insert cluster villages"
  on cluster_villages for insert to authenticated with check (true);
create policy "Authenticated users can update cluster villages"
  on cluster_villages for update to authenticated using (true);
create policy "Authenticated users can delete cluster villages"
  on cluster_villages for delete to authenticated using (true);

drop policy if exists "Authenticated users can read cluster supervisors" on cluster_supervisors;
drop policy if exists "Authenticated users can insert cluster supervisors" on cluster_supervisors;
drop policy if exists "Authenticated users can delete cluster supervisors" on cluster_supervisors;

create policy "Authenticated users can read cluster supervisors"
  on cluster_supervisors for select to authenticated using (true);
create policy "Authenticated users can insert cluster supervisors"
  on cluster_supervisors for insert to authenticated with check (true);
create policy "Authenticated users can delete cluster supervisors"
  on cluster_supervisors for delete to authenticated using (true);

drop policy if exists "Authenticated users can read cluster climapreneurs" on cluster_climapreneurs;
drop policy if exists "Authenticated users can insert cluster climapreneurs" on cluster_climapreneurs;
drop policy if exists "Authenticated users can delete cluster climapreneurs" on cluster_climapreneurs;

create policy "Authenticated users can read cluster climapreneurs"
  on cluster_climapreneurs for select to authenticated using (true);
create policy "Authenticated users can insert cluster climapreneurs"
  on cluster_climapreneurs for insert to authenticated with check (true);
create policy "Authenticated users can delete cluster climapreneurs"
  on cluster_climapreneurs for delete to authenticated using (true);
