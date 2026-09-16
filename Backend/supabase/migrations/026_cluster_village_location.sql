-- Cluster villages store mandal/block, district, and state.
-- Farmers are linked to a cluster village rather than typed location text.

alter table cluster_villages
  add column if not exists mandal text,
  add column if not exists district text,
  add column if not exists state text;

alter table farms
  add column if not exists cluster_id uuid references clusters (id) on delete set null;

alter table farms
  add column if not exists cluster_village_id uuid references cluster_villages (id) on delete set null;

create index if not exists farms_cluster_idx on farms (cluster_id);
create index if not exists farms_cluster_village_idx on farms (cluster_village_id);
