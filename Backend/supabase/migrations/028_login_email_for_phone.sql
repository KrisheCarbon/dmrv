-- Allow password login with the mobile number stored on public.users.
-- Auth identities stay email-based; this maps a 10-digit Indian mobile to that email.

create or replace function public.login_email_for_phone(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  digits text;
  local_number text;
  match_count int;
  matched_email text;
begin
  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if length(digits) = 12 and left(digits, 2) = '91' then
    local_number := right(digits, 10);
  elsif length(digits) = 11 and left(digits, 1) = '0' then
    local_number := right(digits, 10);
  elsif length(digits) = 10 then
    local_number := digits;
  else
    return null;
  end if;

  if local_number !~ '^[6-9][0-9]{9}$' then
    return null;
  end if;

  select count(*)
    into match_count
  from public.users
  where status is distinct from 'disabled'
    and right(
      regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'),
      10
    ) = local_number;

  if match_count <> 1 then
    return null;
  end if;

  select email
    into matched_email
  from public.users
  where status is distinct from 'disabled'
    and right(
      regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'),
      10
    ) = local_number
  limit 1;

  return matched_email;
end;
$$;

revoke all on function public.login_email_for_phone(text) from public;
grant execute on function public.login_email_for_phone(text) to anon, authenticated;

comment on function public.login_email_for_phone(text) is
  'Returns the login email for a unique non-disabled user matching the given Indian mobile number.';

notify pgrst, 'reload schema';
