-- A project site is a polygon the kiln must run inside, not only a pin.

alter table producer_sites
  add column if not exists boundary_geojson jsonb;

notify pgrst, 'reload schema';
