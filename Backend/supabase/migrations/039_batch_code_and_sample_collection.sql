-- Three identifiers for a kiln run:
--   batch_number          the number the field operator types
--   generated_batch_code  batch-{C|R}-{producer}-{serial}
--   id                    the record uuid
--
-- Rainbow collect-sample proof for that kiln run:
--   three spots of biochar, the site composite pile, and a bag QR or a recorded "no bag".

create table if not exists batch_code_counters (
  registry text primary key check (registry in ('csi', 'rainbow')),
  next_serial integer not null
);

insert into batch_code_counters (registry, next_serial)
values ('csi', 1), ('rainbow', 1)
on conflict (registry) do nothing;

create or replace function producer_batch_token(producer_name text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(left(regexp_replace(upper(coalesce(producer_name, '')), '[^A-Z0-9]', '', 'g'), 10), ''),
    'SITE'
  );
$$;

create or replace function next_generated_batch_code(p_registry text, p_producer_name text)
returns text
language plpgsql
as $$
declare
  serial integer;
  letter text;
  registry_key text;
begin
  if p_registry = 'rainbow' then
    letter := 'R';
    registry_key := 'rainbow';
  else
    letter := 'C';
    registry_key := 'csi';
  end if;

  update batch_code_counters
  set next_serial = next_serial + 1
  where batch_code_counters.registry = registry_key
  returning next_serial - 1 into serial;

  return 'batch-' || letter || '-' || producer_batch_token(p_producer_name) || '-' || lpad(serial::text, 4, '0');
end;
$$;

alter table csi_pyrolysis_batches
  add column if not exists generated_batch_code text;

alter table rainbow_pyrolysis_batches
  add column if not exists generated_batch_code text,
  add column if not exists sample_spots jsonb not null default '[]',
  add column if not exists sample_pile_photo_url text,
  add column if not exists sample_pile_photo_metadata jsonb,
  add column if not exists sample_bag_code text,
  add column if not exists sample_bag_photo_url text,
  add column if not exists sample_bag_photo_metadata jsonb,
  add column if not exists sample_bag_not_used boolean not null default false,
  add column if not exists sample_collected_at timestamptz;

create unique index if not exists csi_pyrolysis_batches_generated_code_idx
  on csi_pyrolysis_batches (generated_batch_code)
  where generated_batch_code is not null;

create unique index if not exists rainbow_pyrolysis_batches_generated_code_idx
  on rainbow_pyrolysis_batches (generated_batch_code)
  where generated_batch_code is not null;

comment on column rainbow_pyrolysis_batches.sample_spots is
  'Three biochar spots set aside from this kiln run. Each photo_metadata.captured_at is the watermark time.';

-- Assigned from the API when a kiln run syncs, not when the run is created.

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
    update rainbow_pyrolysis_batches
    set generated_batch_code = next_generated_batch_code('rainbow', producer_name)
    where id = p_batch_id
      and generated_batch_code is null
    returning generated_batch_code into assigned;
  else
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
  end if;

  return assigned;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select
      b.id,
      (
        select bp.name
        from kontikkis k
        join biochar_producers bp on bp.id = k.biochar_producer_id
        where k.id = b.kontikki_id
      ) as producer_name
    from csi_pyrolysis_batches b
    where b.generated_batch_code is null
      and b.submission_status = 'submitted'
    order by b.created_at, b.id
  loop
    update csi_pyrolysis_batches
    set generated_batch_code = next_generated_batch_code('csi', rec.producer_name)
    where id = rec.id;
  end loop;

  for rec in
    select id, producer_name
    from rainbow_pyrolysis_batches
    where generated_batch_code is null
      and submission_status = 'submitted'
    order by created_at, id
  loop
    update rainbow_pyrolysis_batches
    set generated_batch_code = next_generated_batch_code('rainbow', rec.producer_name)
    where id = rec.id;
  end loop;
end $$;
