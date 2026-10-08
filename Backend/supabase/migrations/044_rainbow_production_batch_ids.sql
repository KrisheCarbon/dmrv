-- Rainbow production batch id:
--   [site] - [feedstock] - [start date] - [end date] - [serial]
--   Juba - Cotton stalks - 2026-06-17 - 2027-02-15 - 0001
--
-- One id covers kiln runs of the same producer and feedstock until 200 tonnes
-- of dry biochar (a run already inside may finish up to 205) or 6 months,
-- whichever comes first. While the batch is still open the end date reads "open".

create sequence if not exists rainbow_production_batch_serial;

create table if not exists rainbow_production_batches (
  id uuid primary key default gen_random_uuid(),
  serial integer not null unique,
  producer_id uuid references biochar_producers (id),
  site_name text not null,
  feedstock_name text not null,
  started_on date not null,
  ended_on date,
  dry_biochar_tonnes numeric not null default 0,
  batch_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists rainbow_production_batches_open_idx
  on rainbow_production_batches (producer_id, lower(feedstock_name))
  where ended_on is null;

alter table rainbow_pyrolysis_batches
  add column if not exists production_batch_id uuid references rainbow_production_batches (id);

drop index if exists rainbow_pyrolysis_batches_generated_code_idx;

create index if not exists rainbow_pyrolysis_batches_generated_code_idx
  on rainbow_pyrolysis_batches (generated_batch_code)
  where generated_batch_code is not null;

create index if not exists rainbow_pyrolysis_batches_production_batch_idx
  on rainbow_pyrolysis_batches (production_batch_id);

create or replace function format_rainbow_production_batch_code(
  p_site text,
  p_feedstock text,
  p_started date,
  p_ended date,
  p_serial integer
)
returns text
language sql
immutable
as $$
  select
    coalesce(nullif(btrim(p_site), ''), 'Site')
    || ' - ' ||
    coalesce(nullif(btrim(p_feedstock), ''), 'Feedstock')
    || ' - ' ||
    to_char(p_started, 'YYYY-MM-DD')
    || ' - ' ||
    case
      when p_ended is null then 'open'
      else to_char(p_ended, 'YYYY-MM-DD')
    end
    || ' - ' ||
    lpad(p_serial::text, 4, '0');
$$;

create or replace function refresh_rainbow_production_batch_code(p_id uuid)
returns text
language plpgsql
as $$
declare
  rec rainbow_production_batches%rowtype;
  code text;
begin
  select * into rec from rainbow_production_batches where id = p_id;
  if not found then
    return null;
  end if;

  code := format_rainbow_production_batch_code(
    rec.site_name,
    rec.feedstock_name,
    rec.started_on,
    rec.ended_on,
    rec.serial
  );

  update rainbow_production_batches
  set batch_code = code
  where id = p_id;

  update rainbow_pyrolysis_batches
  set generated_batch_code = code
  where production_batch_id = p_id;

  return code;
end;
$$;

create or replace function close_rainbow_production_batch(p_id uuid, p_ended date)
returns void
language plpgsql
as $$
begin
  update rainbow_production_batches
  set ended_on = coalesce(p_ended, started_on)
  where id = p_id
    and ended_on is null;

  perform refresh_rainbow_production_batch_code(p_id);
end;
$$;

create or replace function assign_rainbow_production_batch(p_batch_id uuid)
returns text
language plpgsql
as $$
declare
  run record;
  site text;
  feedstock text;
  run_on date;
  tonnes numeric;
  open_id uuid;
  open_started date;
  open_tonnes numeric;
  last_on date;
  new_id uuid;
  serial integer;
  total numeric;
begin
  select
    b.id,
    b.producer_id,
    b.producer_name,
    b.feedstock_name,
    b.feedstock_quantity,
    b.yield_percent,
    b.location_address,
    b.generated_batch_code,
    b.production_batch_id,
    b.submission_status,
    coalesce(b.info_saved_at, b.created_at) as run_at
  into run
  from rainbow_pyrolysis_batches b
  where b.id = p_batch_id;

  if not found then
    return null;
  end if;

  if run.submission_status is distinct from 'submitted' then
    return run.generated_batch_code;
  end if;

  if run.production_batch_id is not null then
    return run.generated_batch_code;
  end if;

  feedstock := coalesce(nullif(btrim(run.feedstock_name), ''), 'Feedstock');

  perform pg_advisory_xact_lock(
    hashtext(coalesce(run.producer_id::text, '') || '|' || lower(feedstock))
  );

  select ps.site_name into site
  from producer_sites ps
  where ps.biochar_producer_id = run.producer_id
    and nullif(btrim(ps.site_name), '') is not null
  order by
    case
      when run.location_address is not null
       and position(lower(btrim(ps.site_name)) in lower(run.location_address)) > 0
      then 0
      else 1
    end,
    ps.site_name
  limit 1;

  site := coalesce(nullif(btrim(site), ''), nullif(btrim(run.producer_name), ''), 'Site');
  run_on := (run.run_at at time zone 'Asia/Kolkata')::date;
  tonnes := 0;
  if run.feedstock_quantity is not null
     and run.yield_percent is not null
     and run.feedstock_quantity > 0
     and run.yield_percent > 0 then
    tonnes := (run.feedstock_quantity * (run.yield_percent / 100.0)) / 1000.0;
  end if;

  select id, started_on, dry_biochar_tonnes
  into open_id, open_started, open_tonnes
  from rainbow_production_batches
  where producer_id is not distinct from run.producer_id
    and lower(feedstock_name) = lower(feedstock)
    and ended_on is null
  order by started_on, serial
  limit 1
  for update;

  if open_id is not null
     and (
       run_on >= (open_started + interval '6 months')::date
       or open_tonnes >= 200
       or open_tonnes + tonnes > 205
     ) then
    select max((coalesce(info_saved_at, created_at) at time zone 'Asia/Kolkata')::date)
    into last_on
    from rainbow_pyrolysis_batches
    where production_batch_id = open_id;

    perform close_rainbow_production_batch(open_id, coalesce(last_on, open_started));
    open_id := null;
  end if;

  if open_id is null then
    serial := nextval('rainbow_production_batch_serial');
    insert into rainbow_production_batches (
      serial,
      producer_id,
      site_name,
      feedstock_name,
      started_on,
      ended_on,
      dry_biochar_tonnes,
      batch_code
    ) values (
      serial,
      run.producer_id,
      site,
      feedstock,
      run_on,
      null,
      tonnes,
      format_rainbow_production_batch_code(site, feedstock, run_on, null, serial)
    )
    returning id into new_id;
  else
    new_id := open_id;
    update rainbow_production_batches
    set dry_biochar_tonnes = dry_biochar_tonnes + tonnes
    where id = new_id
    returning dry_biochar_tonnes into total;

    update rainbow_pyrolysis_batches
    set production_batch_id = new_id
    where id = p_batch_id;

    if total >= 200 then
      perform close_rainbow_production_batch(new_id, run_on);
    else
      perform refresh_rainbow_production_batch_code(new_id);
    end if;

    return (select generated_batch_code from rainbow_pyrolysis_batches where id = p_batch_id);
  end if;

  update rainbow_pyrolysis_batches
  set production_batch_id = new_id,
      generated_batch_code = (
        select batch_code from rainbow_production_batches where id = new_id
      )
  where id = p_batch_id;

  select dry_biochar_tonnes into total
  from rainbow_production_batches
  where id = new_id;

  if total >= 200 then
    perform close_rainbow_production_batch(new_id, run_on);
  end if;

  return (select generated_batch_code from rainbow_pyrolysis_batches where id = p_batch_id);
end;
$$;

create or replace function assign_generated_batch_code_if_missing(
  p_registry text,
  p_batch_id uuid
)
returns text
language plpgsql
security definer
as $$
declare
  assigned text;
  producer_name text;
begin
  if p_registry = 'rainbow' then
    return assign_rainbow_production_batch(p_batch_id);
  end if;

  select bp.name into producer_name
  from csi_pyrolysis_batches b
  join kontikkis k on k.id = b.kontikki_id
  join biochar_producers bp on bp.id = k.biochar_producer_id
  where b.id = p_batch_id;

  update csi_pyrolysis_batches
  set generated_batch_code = next_generated_batch_code('csi', producer_name)
  where id = p_batch_id
    and generated_batch_code is null
  returning generated_batch_code into assigned;

  return assigned;
end;
$$;

do $$
declare
  rec record;
begin
  update rainbow_pyrolysis_batches
  set generated_batch_code = null
  where generated_batch_code like 'batch-R-%';

  for rec in
    select id
    from rainbow_pyrolysis_batches
    where submission_status = 'submitted'
      and production_batch_id is null
    order by coalesce(info_saved_at, created_at), id
  loop
    perform assign_rainbow_production_batch(rec.id);
  end loop;
end $$;
