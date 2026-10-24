-- One row per farmer for the portal list: onboarding marks, without plot
-- boundaries, sample sites, or photos. The portal reads this instead of
-- loading every farm and soil sample for the page.

create or replace view public.farmer_list_rows
with (security_invoker = true) as
select
  f.id,
  f.farmer_name,
  f.mobile_number,
  f.address,
  f.village,
  f.mandal,
  f.district,
  f.state,
  f.total_land_size,
  f.farmer_photo_url,
  f.created_at,
  f.created_by,
  f.assigned_to,
  f.cluster_id,
  c.name as cluster_name,
  (
    length(trim(coalesce(f.farmer_name, ''))) > 0
    and length(trim(coalesce(f.mobile_number, ''))) > 0
    and f.cluster_village_id is not null
  ) as profile_complete,
  coalesce(fields.farm_count, 0) as farm_count,
  coalesce(fields.active_farm_count, 0) as active_farm_count,
  fields.farm_onboarded_at,
  coalesce(fields.farm_acres, 0) as farm_acres,
  coalesce(samples.sample_tone, 'none') as sample_tone,
  samples.latest_sample_status,
  coalesce(samples.has_report, false) as has_report
from public.farms f
left join public.clusters c on c.id = f.cluster_id
left join lateral (
  select
    count(*)::int as farm_count,
    count(*) filter (where status is distinct from 'inactive')::int as active_farm_count,
    min(created_at) filter (where status is distinct from 'inactive') as farm_onboarded_at,
    coalesce(
      sum(calculated_area) filter (where status is distinct from 'inactive'),
      0
    ) as farm_acres
  from public.farm_fields ff
  where ff.farm_id = f.id
) fields on true
left join lateral (
  select
    case
      when count(st.id) = 0 then 'none'
      when bool_or(st.status = 'rejected') then 'rejected'
      when bool_or(st.status in ('collected', 'submitted', 'stored')) then 'collected'
      when bool_or(st.status in ('accepted', 'received', 'reported')) then 'accepted'
      else 'none'
    end as sample_tone,
    (array_agg(st.status order by st.sample_date desc nulls last, st.created_at desc))[1]
      as latest_sample_status,
    coalesce(
      bool_or(st.status = 'reported')
      or exists (
        select 1 from public.soil_reports r where r.farm_id = f.id
      ),
      false
    ) as has_report
  from public.soil_tests st
  where st.farm_id = f.id
) samples on true;

revoke all on table public.farmer_list_rows from public;
revoke all on table public.farmer_list_rows from anon, authenticated;
grant select on table public.farmer_list_rows to service_role;

notify pgrst, 'reload schema';
