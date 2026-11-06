-- Lets the same database run on RDS, where Supabase's auth schema is absent,
-- and records the Cognito user id beside the existing users.id.
-- users.id stays the key for every project row. It is not replaced.

alter table public.users
  add column if not exists auth_subject text;

create unique index if not exists users_auth_subject_key
  on public.users (auth_subject)
  where auth_subject is not null;

comment on column public.users.auth_subject is
  'Cognito sub for this person. Null while they still sign in only with Supabase.';

-- Supabase already provides auth.uid(). On plain Postgres this creates the
-- same function from the PostgREST JWT, so policies and list_farmers_page
-- keep working after the database moves.
do $outer$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'uid'
  ) then
    return;
  end if;

  create schema if not exists auth;

  execute $create$
    create function auth.uid()
    returns uuid
    language plpgsql
    stable
    as $body$
    declare
      sub text;
      claims text;
    begin
      sub := nullif(current_setting('request.jwt.claim.sub', true), '');
      if sub is null then
        claims := nullif(current_setting('request.jwt.claims', true), '');
        if claims is not null then
          sub := nullif(claims::jsonb ->> 'sub', '');
        end if;
      end if;
      if sub is null then
        return null;
      end if;
      return sub::uuid;
    exception
      when others then
        return null;
    end;
    $body$
  $create$;

  if exists (select 1 from pg_roles where rolname = 'web_anon') then
    grant usage on schema auth to web_anon;
    grant execute on function auth.uid() to web_anon;
  end if;
end
$outer$;

notify pgrst, 'reload schema';
