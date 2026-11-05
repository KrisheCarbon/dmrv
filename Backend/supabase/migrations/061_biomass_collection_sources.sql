-- One biomass trip can take biomass from several farm plots.
-- Acres on a plot, across every trip, cannot exceed that plot's area.

create table if not exists biomass_collection_sources (
  id uuid primary key default gen_random_uuid(),
  biomass_collection_id uuid not null references biomass_collections (id) on delete cascade,
  farm_id uuid not null references farms (id),
  farm_name text,
  farm_field_id uuid not null references farm_fields (id),
  field_code text,
  acres numeric not null check (acres > 0),
  biomass_tonnes numeric not null check (biomass_tonnes > 0),
  created_at timestamptz not null default now()
);

create index if not exists biomass_collection_sources_collection_idx
  on biomass_collection_sources (biomass_collection_id);

create index if not exists biomass_collection_sources_field_idx
  on biomass_collection_sources (farm_field_id);

-- Supabase has an authenticated role. The AWS database does not; the API
-- role is web_anon and the backend checks the signed-in user first.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'alter table biomass_collection_sources enable row level security';
    execute 'drop policy if exists biomass_collection_sources_select_own on biomass_collection_sources';
    execute $policy$
      create policy biomass_collection_sources_select_own
        on biomass_collection_sources
        for select to authenticated
        using (
          exists (
            select 1
            from biomass_collections c
            where c.id = biomass_collection_id
              and c.operator_id = auth.uid()
          )
        )
    $policy$;
  else
    execute 'alter table biomass_collection_sources disable row level security';
  end if;

  if exists (select 1 from pg_roles where rolname = 'web_anon') then
    execute 'grant select, insert, update, delete on biomass_collection_sources to web_anon';
  end if;
end $$;

notify pgrst, 'reload schema';
