-- The unload place is one dropping site on the producer, not the producer itself.

alter table biomass_collections
  add column if not exists producer_site_id uuid references producer_sites (id);

create index if not exists biomass_collections_producer_site_idx
  on biomass_collections (producer_site_id);

notify pgrst, 'reload schema';
