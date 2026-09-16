-- Link producers to clusters so mixing can show farmers from those clusters.

create table if not exists biochar_producer_clusters (
  biochar_producer_id uuid not null references biochar_producers (id) on delete cascade,
  cluster_id uuid not null references clusters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (biochar_producer_id, cluster_id)
);

create index if not exists biochar_producer_clusters_cluster_idx
  on biochar_producer_clusters (cluster_id);

alter table biochar_producer_clusters enable row level security;

drop policy if exists "Authenticated users can read producer clusters"
  on biochar_producer_clusters;
drop policy if exists "Authenticated users can insert producer clusters"
  on biochar_producer_clusters;
drop policy if exists "Authenticated users can delete producer clusters"
  on biochar_producer_clusters;

create policy "Authenticated users can read producer clusters"
  on biochar_producer_clusters for select to authenticated using (true);
create policy "Authenticated users can insert producer clusters"
  on biochar_producer_clusters for insert to authenticated with check (true);
create policy "Authenticated users can delete producer clusters"
  on biochar_producer_clusters for delete to authenticated using (true);
