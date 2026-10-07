-- The generated batch code is assigned when the kiln run syncs,
-- not when the empty run is created.

drop trigger if exists csi_pyrolysis_batches_assign_code on csi_pyrolysis_batches;
drop trigger if exists rainbow_pyrolysis_batches_assign_code on rainbow_pyrolysis_batches;

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
