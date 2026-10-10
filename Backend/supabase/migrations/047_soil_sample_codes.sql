-- Readable soil sample numbers (written on the sample bag) and a short,
-- permanent collector code per user so the app can issue them offline.

create sequence if not exists users_collector_code_seq;

alter table if exists users
  add column if not exists collector_code text;

update users u
set collector_code = 'C' || nextval('users_collector_code_seq')
from (
  select id from users where collector_code is null order by created_at, id
) pending
where u.id = pending.id;

alter table if exists users
  alter column collector_code set default 'C' || nextval('users_collector_code_seq');

create unique index if not exists users_collector_code_key
  on users (collector_code);

alter table if exists soil_tests
  add column if not exists sample_code text;

create unique index if not exists soil_tests_sample_code_key
  on soil_tests (sample_code)
  where sample_code is not null;
