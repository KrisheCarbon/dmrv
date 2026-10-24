-- Biomass is collected from one mapped plot of an onboarded farmer.

alter table biomass_collections
  add column if not exists farm_field_id uuid references farm_fields (id),
  add column if not exists field_code text;

create index if not exists biomass_collections_farm_field_idx
  on biomass_collections (farm_field_id);
