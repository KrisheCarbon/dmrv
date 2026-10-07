-- Once a kiln run is uploaded, the operator cannot change it.
-- Project records stay for at least five years after the final monitoring period.

alter table csi_pyrolysis_batches
  add column if not exists uploaded_at timestamptz;

alter table rainbow_pyrolysis_batches
  add column if not exists uploaded_at timestamptz;

comment on column csi_pyrolysis_batches.uploaded_at is
  'When this kiln run was first uploaded. The run is locked after this.';
comment on column rainbow_pyrolysis_batches.uploaded_at is
  'When this kiln run was first uploaded. The run is locked after this.';

comment on table csi_pyrolysis_batches is
  'Retain for at least five years after the project final monitoring period ends.';
comment on table rainbow_pyrolysis_batches is
  'Retain for at least five years after the project final monitoring period ends.';

create table if not exists project_record_retention (
  id integer primary key default 1 check (id = 1),
  retain_years_after_final_monitoring integer not null default 5,
  rule text not null
);

insert into project_record_retention (id, retain_years_after_final_monitoring, rule)
values (
  1,
  5,
  'All project records are kept for at least five years after the project final monitoring period ends. Submitted kiln runs and their photos are not deleted.'
)
on conflict (id) do update
set retain_years_after_final_monitoring = excluded.retain_years_after_final_monitoring,
    rule = excluded.rule;

create or replace function reject_delete_of_uploaded_kiln_run()
returns trigger
language plpgsql
as $$
begin
  if old.submission_status = 'submitted' then
    raise exception 'An uploaded kiln run is kept for at least five years after the project final monitoring period and cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists csi_pyrolysis_batches_keep_uploaded on csi_pyrolysis_batches;
create trigger csi_pyrolysis_batches_keep_uploaded
  before delete on csi_pyrolysis_batches
  for each row execute function reject_delete_of_uploaded_kiln_run();

drop trigger if exists rainbow_pyrolysis_batches_keep_uploaded on rainbow_pyrolysis_batches;
create trigger rainbow_pyrolysis_batches_keep_uploaded
  before delete on rainbow_pyrolysis_batches
  for each row execute function reject_delete_of_uploaded_kiln_run();

create or replace function pyrolysis_photo_batch_is_draft(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from csi_pyrolysis_batches b
    where b.id::text = split_part(object_name, '/', 2)
      and b.submission_status = 'draft'
  )
  or exists (
    select 1
    from rainbow_pyrolysis_batches b
    where b.id::text = split_part(object_name, '/', 2)
      and b.submission_status = 'draft'
  );
$$;

drop policy if exists "pyrolysis_storage_update" on storage.objects;
drop policy if exists "pyrolysis_storage_delete" on storage.objects;

create policy "pyrolysis_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pyrolysis'
  and pyrolysis_photo_batch_is_draft(name)
)
with check (
  bucket_id = 'pyrolysis'
  and pyrolysis_photo_batch_is_draft(name)
);

create policy "pyrolysis_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pyrolysis'
  and pyrolysis_photo_batch_is_draft(name)
);
