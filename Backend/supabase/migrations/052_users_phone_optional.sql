-- dMRV viewers only read the web portal and may be added without a mobile number.
-- Every other role still has its number checked in the portal before saving.

alter table if exists users
  alter column phone drop not null;
