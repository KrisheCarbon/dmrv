-- Farmer profile photograph captured during onboarding.

alter table if exists farms
  add column if not exists farmer_photo_url text;

comment on column farms.farmer_photo_url is
  'Public URL of the farmer portrait captured in the field app or uploaded in admin.';
