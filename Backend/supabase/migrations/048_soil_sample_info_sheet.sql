-- Photo of the filled-in soil sample info sheet, taken when the sample is collected.

alter table if exists soil_tests
  add column if not exists info_sheet_photo_url text;
