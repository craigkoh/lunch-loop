-- A signed-in person without an active Lunch Loop may create their first
-- private loop directly. Joining an existing loop remains owner-invite-only.

create or replace function public.create_first_lunch_loop(
  new_group_name text,
  new_display_name text,
  new_home_label text,
  new_home_lat numeric,
  new_home_lng numeric,
  new_search_radius_miles smallint,
  new_time_zone text,
  new_loop_type text default 'standing'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  new_group uuid;
  normalized_loop_type text := lower(trim(coalesce(new_loop_type, 'standing')));
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a Lunch Loop';
  end if;
  if not coalesce((select allow_new_groups from public.site_settings where singleton), true)
    and not public.is_site_admin() then
    raise exception 'New Lunch Loops are not available right now';
  end if;
  if exists (
    select 1
    from public.group_members member
    join public.groups group_record on group_record.id = member.group_id
    where member.user_id = auth.uid()
      and group_record.status in ('active', 'suspended')
  ) then
    raise exception 'Use My Lunch Loops to add another loop or join a crew invitation';
  end if;
  if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then
    raise exception 'Give your Lunch Loop a name between 1 and 80 characters';
  end if;
  if char_length(trim(coalesce(new_display_name, ''))) not between 1 and 50 then
    raise exception 'Tell your crew what to call you';
  end if;
  if normalized_loop_type not in ('standing', 'occasion') then
    raise exception 'Choose a Standing or Occasion Lunch Loop';
  end if;
  if char_length(trim(coalesce(new_home_label, ''))) not between 2 and 160 then
    raise exception 'Choose a city or area for your Lunch Loop';
  end if;
  if new_home_lat is null or new_home_lat not between -90 and 90
    or new_home_lng is null or new_home_lng not between -180 and 180 then
    raise exception 'Choose a valid map location for your Lunch Loop';
  end if;
  if new_search_radius_miles not between 1 and 35 then
    raise exception 'Choose a radius from 1 to 35 miles';
  end if;
  if not public.is_valid_lunch_loop_time_zone(trim(coalesce(new_time_zone, ''))) then
    raise exception 'Choose a valid time zone';
  end if;

  perform public.enforce_user_rate_limit('create_first_lunch_loop', 2, interval '1 hour');
  perform public.sync_lunch_profile(new_display_name);

  insert into public.groups(
    name,
    home_label,
    home_lat,
    home_lng,
    search_radius_miles,
    time_zone,
    loop_type
  ) values (
    trim(new_group_name),
    trim(new_home_label),
    new_home_lat,
    new_home_lng,
    new_search_radius_miles,
    trim(new_time_zone),
    normalized_loop_type
  )
  returning id into new_group;

  insert into public.group_members(group_id, user_id, role, rotation_order)
  values (new_group, auth.uid(), 'owner', 0);

  if normalized_loop_type = 'occasion' then
    perform public.copy_member_restaurants_to_lunch_loop(new_group, auth.uid());
  end if;

  update public.profiles
  set active_group_id = new_group
  where id = auth.uid();

  return new_group;
end;
$body$;

revoke all on function public.create_first_lunch_loop(text, text, text, numeric, numeric, smallint, text, text) from public, anon, authenticated;
grant execute on function public.create_first_lunch_loop(text, text, text, numeric, numeric, smallint, text, text) to authenticated;

notify pgrst, 'reload schema';
