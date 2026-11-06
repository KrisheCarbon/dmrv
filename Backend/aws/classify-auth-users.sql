-- Run in the Supabase SQL editor before the Cognito cutover.
-- Groups each auth user. Does not print password hashes.

select
  u.id,
  u.email,
  p.role,
  p.status,
  p.phone,
  (coalesce(u.encrypted_password, '') <> '') as has_password,
  (u.email ilike '%@phone.krishecarbon.invalid') as phone_login,
  (u.email ilike '%@krishecarbon.com') as staff_inbox,
  case
    when p.id is null then 'missing profile'
    when p.status = 'disabled' then 'disabled'
    when p.status = 'pending_auth' then 'invited, send a new invite'
    when coalesce(u.encrypted_password, '') <> '' then 'password, migrates on next sign-in'
    when u.email ilike '%@krishecarbon.com' then 'email code only, needs a reset or a code flow'
    else 'no password'
  end as migration_path
from auth.users u
left join public.users p on p.id = u.id
order by migration_path, u.email;
