-- Rainbow batch-code assignment failed because producer_name is both a
-- function variable and a column on rainbow_pyrolysis_batches. Postgres
-- rejects the update, the kiln run stays submitted with no code, and the
-- next photo retry hits the storage policy that only allows draft runs:
-- "new row violates row-level security policy".

do $outer$
begin
  if to_regprocedure('public.assign_rainbow_production_batch(uuid)') is not null then
    return;
  end if;

  execute $fn$
    create or replace function assign_generated_batch_code_if_missing(
      p_registry text,
      p_batch_id uuid
    )
    returns text
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      assigned text;
      v_producer_name text;
    begin
      if p_registry = 'rainbow' then
        update rainbow_pyrolysis_batches as batch
        set generated_batch_code = next_generated_batch_code('rainbow', batch.producer_name)
        where batch.id = p_batch_id
          and batch.generated_batch_code is null
        returning generated_batch_code into assigned;
      else
        select bp.name into v_producer_name
        from csi_pyrolysis_batches b
        join kontikkis k on k.id = b.kontikki_id
        join biochar_producers bp on bp.id = k.biochar_producer_id
        where b.id = p_batch_id;

        update csi_pyrolysis_batches
        set generated_batch_code = next_generated_batch_code('csi', v_producer_name)
        where id = p_batch_id
          and generated_batch_code is null
        returning generated_batch_code into assigned;
      end if;

      return assigned;
    end;
    $body$;
  $fn$;
end
$outer$;

-- These runs were locked before a code could be saved. Open them so the
-- phone can finish the upload. The storage policy allows photo writes
-- only while submission_status is draft.
update rainbow_pyrolysis_batches
set submission_status = 'draft',
    uploaded_at = null
where submission_status = 'submitted'
  and generated_batch_code is null;

update csi_pyrolysis_batches
set submission_status = 'draft',
    uploaded_at = null
where submission_status = 'submitted'
  and generated_batch_code is null;
