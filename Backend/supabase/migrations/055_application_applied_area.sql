-- Where on the farm the biochar was applied, as a polygon drawn in the field app.

alter table application_entries
  add column if not exists farm_field_id uuid references farm_fields (id),
  add column if not exists field_code text,
  add column if not exists application_boundary_geojson jsonb;

create index if not exists application_entries_farm_field_idx
  on application_entries (farm_field_id);
