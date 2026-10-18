-- Each Lunch Loop owns its own Places search area. Existing Evansville data
-- remains untouched and is explicitly assigned to the original crew.

alter table public.groups
  add column if not exists home_label text,
  add column if not exists home_lat numeric(9, 6),
  add column if not exists home_lng numeric(9, 6),
  add column if not exists search_radius_miles smallint;

alter table public.groups drop constraint if exists groups_home_radius_check;
alter table public.groups add constraint groups_home_radius_check
  check (search_radius_miles is null or search_radius_miles between 1 and 35);
alter table public.groups drop constraint if exists groups_home_coordinates_check;
alter table public.groups add constraint groups_home_coordinates_check
  check ((home_lat is null and home_lng is null) or (home_lat between -90 and 90 and home_lng between -180 and 180));

-- The original production Lunch Loop is the Evansville-area crew. Do not
-- overwrite location choices on any later public-launch loops.
update public.groups
set home_label = 'Evansville, IN',
    home_lat = 37.971559,
    home_lng = -87.571089,
    search_radius_miles = 35
where lower(name) in ('nerd dinner', 'nerd lunch')
  and home_label is null;

drop function if exists public.get_my_lunch_loops();
create function public.get_my_lunch_loops()
returns table(
  group_id uuid,
  group_name text,
  role text,
  status text,
  active boolean,
  member_count bigint,
  created_at timestamptz,
  delete_scheduled_for timestamptz,
  home_label text,
  home_lat numeric,
  home_lng numeric,
  search_radius_miles smallint,
  owner_display_name text
)
language sql security definer set search_path = public, pg_catalog as $body$
  select group_record.id,
    group_record.name,
    member.role,
    group_record.status,
    coalesce(profile.active_group_id = group_record.id, false),
    (select count(*) from public.group_members each_member where each_member.group_id = group_record.id),
    group_record.created_at,
    group_record.delete_scheduled_for,
    group_record.home_label,
    group_record.home_lat,
    group_record.home_lng,
    group_record.search_radius_miles,
    coalesce((
      select owner_profile.display_name
      from public.group_members owner_member
      join public.profiles owner_profile on owner_profile.id = owner_member.user_id
      where owner_member.group_id = group_record.id and owner_member.role = 'owner'
      order by owner_member.joined_at
      limit 1
    ), 'Lunch Loop owner')
  from public.group_members member
  join public.groups group_record on group_record.id = member.group_id
  join public.profiles profile on profile.id = auth.uid()
  where member.user_id = auth.uid()
  order by (profile.active_group_id = group_record.id) desc nulls last, group_record.created_at desc
$body$;

create or replace function public.save_lunch_loop_home_area(
  target_group uuid,
  new_home_label text,
  new_home_lat numeric,
  new_home_lng numeric,
  new_search_radius_miles smallint
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if auth.uid() is null or not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can change its home area';
  end if;
  if char_length(trim(coalesce(new_home_label, ''))) not between 2 and 160 then
    raise exception 'Choose a city or area for this Lunch Loop';
  end if;
  if new_home_lat is null or new_home_lat not between -90 and 90 or new_home_lng is null or new_home_lng not between -180 and 180 then
    raise exception 'Choose a valid map location for this Lunch Loop';
  end if;
  if new_search_radius_miles not between 1 and 35 then
    raise exception 'Choose a radius from 1 to 35 miles';
  end if;
  update public.groups
  set home_label = trim(new_home_label),
      home_lat = new_home_lat,
      home_lng = new_home_lng,
      search_radius_miles = new_search_radius_miles
  where id = target_group;
end;
$body$;

drop function if exists public.redeem_loop_creation_invitation(text, text, text);
create function public.redeem_loop_creation_invitation(
  raw_token text,
  new_group_name text,
  new_display_name text,
  new_home_label text,
  new_home_lat numeric,
  new_home_lng numeric,
  new_search_radius_miles smallint
)
returns uuid language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
declare invitation public.loop_creation_invitations%rowtype; account_email text; new_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a Lunch Loop'; end if;
  if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Give your Lunch Loop a name between 1 and 80 characters'; end if;
  if char_length(trim(coalesce(new_home_label, ''))) not between 2 and 160 then raise exception 'Choose a city or area for your Lunch Loop'; end if;
  if new_home_lat is null or new_home_lat not between -90 and 90 or new_home_lng is null or new_home_lng not between -180 and 180 then raise exception 'Choose a valid map location for your Lunch Loop'; end if;
  if new_search_radius_miles not between 1 and 35 then raise exception 'Choose a radius from 1 to 35 miles'; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  update public.loop_creation_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  select * into invitation from public.loop_creation_invitations where status = 'pending' and expires_at > now()
    and token_hash = encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex') for update;
  if not found then raise exception 'That new-loop invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email; end if;
  if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= 2 then raise exception 'An account can own up to two active Lunch Loops'; end if;
  perform public.sync_lunch_profile(new_display_name);
  insert into public.groups(name, home_label, home_lat, home_lng, search_radius_miles)
  values (trim(new_group_name), trim(new_home_label), new_home_lat, new_home_lng, new_search_radius_miles)
  returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  update public.loop_creation_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), created_group_id = new_group where id = invitation.id;
  update public.profiles set active_group_id = new_group where id = auth.uid();
  return new_group;
end;
$body$;

create or replace function public.delete_site_lunch_loop_feedback(target_feedback uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  delete from public.lunch_loop_feedback where id = target_feedback;
  if not found then raise exception 'That feedback item is no longer available'; end if;
end;
$body$;

revoke all on function public.get_my_lunch_loops(), public.save_lunch_loop_home_area(uuid, text, numeric, numeric, smallint), public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint), public.delete_site_lunch_loop_feedback(uuid) from public, anon, authenticated;
grant execute on function public.get_my_lunch_loops(), public.save_lunch_loop_home_area(uuid, text, numeric, numeric, smallint), public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint), public.delete_site_lunch_loop_feedback(uuid) to authenticated;

notify pgrst, 'reload schema';
