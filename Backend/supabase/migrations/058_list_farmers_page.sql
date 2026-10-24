-- One call for the farmers table. The portal used to sign in, wake the
-- backend, and sign in again before this 10-row read. This function does
-- the same permission check inside the database.

create or replace function public.list_farmers_page(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default null,
  p_dir text default null,
  p_name text default null,
  p_mobile text default null,
  p_location text default null,
  p_state text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_viewer boolean;
  v_see_all boolean;
  v_page integer;
  v_size integer;
  v_sort text;
  v_asc boolean;
  v_name text;
  v_mobile text;
  v_location text;
  v_state text;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select role into v_role from users where id = v_uid;
  if v_role is null then
    raise exception 'User profile not found';
  end if;

  v_viewer := v_role = 'dmrv_viewer';
  v_see_all := v_role in ('admin', 'manager', 'supervisor', 'dmrv_viewer');
  v_page := greatest(1, coalesce(p_page, 1));
  v_size := case
    when p_page_size in (10, 25, 50, 100) then p_page_size
    else 10
  end;
  v_asc := p_dir = 'asc';
  v_sort := case
    when v_viewer and p_sort = 'mobile' then 'created_at'
    when p_sort = 'name' then 'farmer_name'
    when p_sort = 'mobile' then 'mobile_number'
    when p_sort = 'village' then 'village'
    when p_sort = 'state' then 'state'
    when p_sort = 'farmerOnboarded' then 'created_at'
    when p_sort = 'totalAcres' then 'total_land_size'
    else 'created_at'
  end;

  v_name := nullif(replace(replace(replace(btrim(coalesce(p_name, '')), '\', ''), '%', ''), '_', ''), '');
  v_mobile := case
    when v_viewer then null
    else nullif(replace(replace(replace(btrim(coalesce(p_mobile, '')), '\', ''), '%', ''), '_', ''), '')
  end;
  v_location := nullif(replace(replace(replace(btrim(coalesce(p_location, '')), '\', ''), '%', ''), '_', ''), '');
  v_state := nullif(replace(replace(replace(btrim(coalesce(p_state, '')), '\', ''), '%', ''), '_', ''), '');

  with filtered as (
    select *
    from farmer_list_rows r
    where (v_see_all or r.created_by = v_uid or r.assigned_to = v_uid)
      and (v_name is null or r.farmer_name ilike '%' || v_name || '%')
      and (v_mobile is null or r.mobile_number ilike '%' || v_mobile || '%')
      and (
        v_location is null
        or r.village ilike '%' || v_location || '%'
        or r.mandal ilike '%' || v_location || '%'
        or r.district ilike '%' || v_location || '%'
        or r.address ilike '%' || v_location || '%'
      )
      and (v_state is null or r.state ilike '%' || v_state || '%')
  ),
  paged as (
    select *
    from filtered
    order by
      case when v_sort = 'farmer_name' and v_asc then farmer_name end asc nulls last,
      case when v_sort = 'farmer_name' and not v_asc then farmer_name end desc nulls last,
      case when v_sort = 'mobile_number' and v_asc then mobile_number end asc nulls last,
      case when v_sort = 'mobile_number' and not v_asc then mobile_number end desc nulls last,
      case when v_sort = 'village' and v_asc then village end asc nulls last,
      case when v_sort = 'village' and not v_asc then village end desc nulls last,
      case when v_sort = 'state' and v_asc then state end asc nulls last,
      case when v_sort = 'state' and not v_asc then state end desc nulls last,
      case when v_sort = 'total_land_size' and v_asc then total_land_size end asc nulls last,
      case when v_sort = 'total_land_size' and not v_asc then total_land_size end desc nulls last,
      case when v_sort = 'created_at' and v_asc then created_at end asc nulls last,
      case when v_sort = 'created_at' and not v_asc then created_at end desc nulls last,
      id asc
    limit v_size
    offset (v_page - 1) * v_size
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'farmer_name', p.farmer_name,
          'mobile_number', case when v_viewer then null else p.mobile_number end,
          'address', p.address,
          'village', p.village,
          'mandal', p.mandal,
          'district', p.district,
          'state', p.state,
          'total_land_size', p.total_land_size,
          'farmer_photo_url', case when v_viewer then null else p.farmer_photo_url end,
          'created_at', p.created_at,
          'cluster', case
            when p.cluster_id is null then null
            else jsonb_build_object(
              'id', p.cluster_id,
              'name', coalesce(nullif(btrim(p.cluster_name), ''), 'Unnamed cluster')
            )
          end,
          'profile_complete', p.profile_complete,
          'farm_count', p.farm_count,
          'active_farm_count', p.active_farm_count,
          'farm_onboarded_at', p.farm_onboarded_at,
          'farm_acres', p.farm_acres,
          'sample_tone', p.sample_tone,
          'latest_sample_status', p.latest_sample_status,
          'has_report', p.has_report
        )
        order by
          case when v_sort = 'farmer_name' and v_asc then p.farmer_name end asc nulls last,
          case when v_sort = 'farmer_name' and not v_asc then p.farmer_name end desc nulls last,
          case when v_sort = 'mobile_number' and v_asc then p.mobile_number end asc nulls last,
          case when v_sort = 'mobile_number' and not v_asc then p.mobile_number end desc nulls last,
          case when v_sort = 'village' and v_asc then p.village end asc nulls last,
          case when v_sort = 'village' and not v_asc then p.village end desc nulls last,
          case when v_sort = 'state' and v_asc then p.state end asc nulls last,
          case when v_sort = 'state' and not v_asc then p.state end desc nulls last,
          case when v_sort = 'total_land_size' and v_asc then p.total_land_size end asc nulls last,
          case when v_sort = 'total_land_size' and not v_asc then p.total_land_size end desc nulls last,
          case when v_sort = 'created_at' and v_asc then p.created_at end asc nulls last,
          case when v_sort = 'created_at' and not v_asc then p.created_at end desc nulls last,
          p.id asc
      )
      from paged p
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_farmers_page(integer, integer, text, text, text, text, text, text) from public;
revoke all on function public.list_farmers_page(integer, integer, text, text, text, text, text, text) from anon;
grant execute on function public.list_farmers_page(integer, integer, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
