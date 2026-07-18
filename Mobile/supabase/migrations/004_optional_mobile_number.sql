-- Allow farmers without a mobile number at onboarding time.
alter table public.farmers
  alter column mobile_number drop not null;
