-- Per-loop local time and durable Places API guardrails. Time zones are stored
-- on the loop, not on a browser or a person, so every crew sees the same meal
-- date, availability, and Discord wording.

alter table public.groups
  add column if not exists time_zone text not null default 'America/Chicago';

update public.groups
set time_zone = 'America/Chicago'
where lower(name) in ('nerd dinner', 'nerd lunch')
  and (time_zone is null or time_zone = '');

alter table public.site_settings
  add column if not exists place_search_user_limit_10m integer not null default 30,
  add column if not exists place_search_group_limit_10m integer not null default 120,
  add column if not exists place_detail_user_limit_10m integer not null default 60,
  add column if not exists place_detail_group_limit_10m integer not null default 240,
  add column if not exists area_search_user_limit_10m integer not null default 20,
  add column if not exists places_user_limit_per_day integer not null default 250,
  add column if not exists places_group_limit_per_day integer not null default 1500;

alter table public.site_settings drop constraint if exists site_settings_places_limits_check;
alter table public.site_settings add constraint site_settings_places_limits_check check (
  place_search_user_limit_10m between 1 and 1000
  and place_search_group_limit_10m between 1 and 10000
  and place_detail_user_limit_10m between 1 and 2000
  and place_detail_group_limit_10m between 1 and 20000
  and area_search_user_limit_10m between 1 and 1000
  and places_user_limit_per_day between 1 and 10000
  and places_group_limit_per_day between 1 and 100000
);

create table if not exists public.places_api_usage_events (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  action_name text not null check (action_name in ('place_search', 'place_detail', 'area_search')),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade
);
create index if not exists places_api_usage_events_user_action_requested_idx
  on public.places_api_usage_events (user_id, action_name, requested_at desc);
create index if not exists places_api_usage_events_group_action_requested_idx
  on public.places_api_usage_events (group_id, action_name, requested_at desc)
  where group_id is not null;
create index if not exists places_api_usage_events_requested_idx
  on public.places_api_usage_events (requested_at desc);
alter table public.places_api_usage_events enable row level security;

create or replace function public.is_valid_lunch_loop_time_zone(candidate text)
returns boolean language sql stable security definer set search_path = pg_catalog as $body$
  select exists(select 1 from pg_timezone_names where name = candidate)
$body$;

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
  time_zone text,
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
    group_record.time_zone,
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

drop function if exists public.save_lunch_loop_home_area(uuid, text, numeric, numeric, smallint);
create function public.save_lunch_loop_home_area(
  target_group uuid,
  new_home_label text,
  new_home_lat numeric,
  new_home_lng numeric,
  new_search_radius_miles smallint,
  new_time_zone text
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
  if not public.is_valid_lunch_loop_time_zone(trim(coalesce(new_time_zone, ''))) then
    raise exception 'Choose a valid IANA time zone';
  end if;
  update public.groups
  set home_label = trim(new_home_label),
      home_lat = new_home_lat,
      home_lng = new_home_lng,
      search_radius_miles = new_search_radius_miles,
      time_zone = trim(new_time_zone)
  where id = target_group;
end;
$body$;

drop function if exists public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint);
create function public.redeem_loop_creation_invitation(
  raw_token text,
  new_group_name text,
  new_display_name text,
  new_home_label text,
  new_home_lat numeric,
  new_home_lng numeric,
  new_search_radius_miles smallint,
  new_time_zone text
)
returns uuid language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
declare invitation public.loop_creation_invitations%rowtype; account_email text; new_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a Lunch Loop'; end if;
  if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Give your Lunch Loop a name between 1 and 80 characters'; end if;
  if char_length(trim(coalesce(new_home_label, ''))) not between 2 and 160 then raise exception 'Choose a city or area for your Lunch Loop'; end if;
  if new_home_lat is null or new_home_lat not between -90 and 90 or new_home_lng is null or new_home_lng not between -180 and 180 then raise exception 'Choose a valid map location for your Lunch Loop'; end if;
  if new_search_radius_miles not between 1 and 35 then raise exception 'Choose a radius from 1 to 35 miles'; end if;
  if not public.is_valid_lunch_loop_time_zone(trim(coalesce(new_time_zone, ''))) then raise exception 'Choose a valid IANA time zone'; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  update public.loop_creation_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  select * into invitation from public.loop_creation_invitations where status = 'pending' and expires_at > now()
    and token_hash = encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex') for update;
  if not found then raise exception 'That new-loop invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email; end if;
  if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= 2 then raise exception 'An account can own up to two active Lunch Loops'; end if;
  perform public.sync_lunch_profile(new_display_name);
  insert into public.groups(name, home_label, home_lat, home_lng, search_radius_miles, time_zone)
  values (trim(new_group_name), trim(new_home_label), new_home_lat, new_home_lng, new_search_radius_miles, trim(new_time_zone))
  returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  update public.loop_creation_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), created_group_id = new_group where id = invitation.id;
  update public.profiles set active_group_id = new_group where id = auth.uid();
  return new_group;
end;
$body$;

-- The API routes call this before an outbound Google request. Advisory locks
-- make the count-and-record operation durable across Vercel instances.
create function public.enforce_lunch_loop_places_limit(
  requested_action text,
  target_group uuid default null
)
returns table(allowed boolean, retry_after_seconds integer, message text)
language plpgsql security definer set search_path = public, pg_catalog as $body$
declare settings_record public.site_settings%rowtype;
  user_ten_minute_limit integer;
  group_ten_minute_limit integer;
  user_daily_limit integer;
  group_daily_limit integer;
  user_ten_minute_count integer;
  group_ten_minute_count integer;
  user_daily_count integer;
  group_daily_count integer;
  oldest_window timestamptz;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if requested_action not in ('place_search', 'place_detail', 'area_search') then raise exception 'Unknown API usage action'; end if;
  if target_group is not null and not public.is_group_member(target_group) then raise exception 'You are not a member of this Lunch Loop'; end if;
  select * into settings_record from public.site_settings where singleton;
  if not found then raise exception 'Site usage settings are unavailable'; end if;

  if requested_action = 'place_search' then
    user_ten_minute_limit := settings_record.place_search_user_limit_10m;
    group_ten_minute_limit := settings_record.place_search_group_limit_10m;
  elsif requested_action = 'place_detail' then
    user_ten_minute_limit := settings_record.place_detail_user_limit_10m;
    group_ten_minute_limit := settings_record.place_detail_group_limit_10m;
  else
    user_ten_minute_limit := settings_record.area_search_user_limit_10m;
    group_ten_minute_limit := null;
  end if;
  user_daily_limit := settings_record.places_user_limit_per_day;
  group_daily_limit := settings_record.places_group_limit_per_day;

  perform pg_advisory_xact_lock(hashtextextended('places-user:' || auth.uid()::text || ':' || requested_action, 0));
  if target_group is not null then
    perform pg_advisory_xact_lock(hashtextextended('places-group:' || target_group::text || ':' || requested_action, 0));
  end if;
  select count(*)::integer, min(requested_at) into user_ten_minute_count, oldest_window
  from public.places_api_usage_events
  where user_id = auth.uid() and action_name = requested_action and requested_at > now() - interval '10 minutes';
  if user_ten_minute_count >= user_ten_minute_limit then
    return query select false, greatest(1, ceil(extract(epoch from (oldest_window + interval '10 minutes' - now())))::integer), 'You have reached this ten-minute Places limit. Please wait and try again.';
    return;
  end if;
  if target_group is not null and group_ten_minute_limit is not null then
    select count(*)::integer, min(requested_at) into group_ten_minute_count, oldest_window
    from public.places_api_usage_events
    where group_id = target_group and action_name = requested_action and requested_at > now() - interval '10 minutes';
    if group_ten_minute_count >= group_ten_minute_limit then
      return query select false, greatest(1, ceil(extract(epoch from (oldest_window + interval '10 minutes' - now())))::integer), 'This Lunch Loop has reached its ten-minute Places limit. Please wait and try again.';
      return;
    end if;
  end if;
  select count(*)::integer into user_daily_count
  from public.places_api_usage_events
  where user_id = auth.uid() and requested_at >= date_trunc('day', now());
  if user_daily_count >= user_daily_limit then
    return query select false, greatest(1, ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::integer), 'You have reached today''s Places limit. Please try again tomorrow.';
    return;
  end if;
  if target_group is not null then
    select count(*)::integer into group_daily_count
    from public.places_api_usage_events
    where group_id = target_group and requested_at >= date_trunc('day', now());
    if group_daily_count >= group_daily_limit then
      return query select false, greatest(1, ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::integer), 'This Lunch Loop has reached today''s Places limit. Please try again tomorrow.';
      return;
    end if;
  end if;
  insert into public.places_api_usage_events(action_name, user_id, group_id)
  values (requested_action, auth.uid(), target_group);
  return query select true, 0, null::text;
end;
$body$;

create function public.get_site_places_usage(days_to_include integer default 7)
returns table(day date, action_name text, requests bigint, people bigint, lunch_loops bigint)
language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if days_to_include not between 1 and 90 then raise exception 'Choose one to 90 days'; end if;
  return query
    select timezone('UTC', event.requested_at)::date,
      event.action_name,
      count(*),
      count(distinct event.user_id),
      count(distinct event.group_id)
    from public.places_api_usage_events event
    where event.requested_at >= now() - make_interval(days => days_to_include)
    group by 1, 2
    order by 1 desc, 2;
end;
$body$;

create function public.get_site_places_usage_by_group(days_to_include integer default 7)
returns table(group_id uuid, group_name text, requests bigint, place_searches bigint, place_details bigint, latest_request_at timestamptz)
language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if days_to_include not between 1 and 90 then raise exception 'Choose one to 90 days'; end if;
  return query
    select group_record.id,
      group_record.name,
      count(event.id),
      count(event.id) filter (where event.action_name = 'place_search'),
      count(event.id) filter (where event.action_name = 'place_detail'),
      max(event.requested_at)
    from public.places_api_usage_events event
    join public.groups group_record on group_record.id = event.group_id
    where event.requested_at >= now() - make_interval(days => days_to_include)
    group by group_record.id, group_record.name
    order by count(event.id) desc, max(event.requested_at) desc;
end;
$body$;

create function public.global_admin_update_places_usage_limits(
  new_place_search_user_limit_10m integer,
  new_place_search_group_limit_10m integer,
  new_place_detail_user_limit_10m integer,
  new_place_detail_group_limit_10m integer,
  new_area_search_user_limit_10m integer,
  new_places_user_limit_per_day integer,
  new_places_group_limit_per_day integer
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if new_place_search_user_limit_10m not between 1 and 1000
    or new_place_search_group_limit_10m not between 1 and 10000
    or new_place_detail_user_limit_10m not between 1 and 2000
    or new_place_detail_group_limit_10m not between 1 and 20000
    or new_area_search_user_limit_10m not between 1 and 1000
    or new_places_user_limit_per_day not between 1 and 10000
    or new_places_group_limit_per_day not between 1 and 100000 then
    raise exception 'Usage limits are outside their safe ranges';
  end if;
  update public.site_settings set
    place_search_user_limit_10m = new_place_search_user_limit_10m,
    place_search_group_limit_10m = new_place_search_group_limit_10m,
    place_detail_user_limit_10m = new_place_detail_user_limit_10m,
    place_detail_group_limit_10m = new_place_detail_group_limit_10m,
    area_search_user_limit_10m = new_area_search_user_limit_10m,
    places_user_limit_per_day = new_places_user_limit_per_day,
    places_group_limit_per_day = new_places_group_limit_per_day,
    updated_at = now(), updated_by = auth.uid()
  where singleton;
end;
$body$;

-- Discord dates and meal names must come from the group's local time zone.
create or replace function public.notify_discord_on_lunch_session()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $body$
declare group_name text; group_time_zone text; suggester_name text; winner_name text; next_picker text; meal_name text; scheduled_label text;
begin
  select name, time_zone into group_name, group_time_zone from public.groups where id = new.group_id;
  group_time_zone := coalesce(group_time_zone, 'America/Chicago');
  scheduled_label := to_char(timezone(group_time_zone, new.scheduled_for), 'FMDay, Mon FMDD, YYYY "at" FMHH12:MI AM');
  meal_name := case when extract(hour from timezone(group_time_zone, new.scheduled_for)) >= 16 then 'dinner' else 'lunch' end;
  if tg_op = 'INSERT' and new.status = 'active' then
    select profile.display_name into suggester_name from public.profiles profile where profile.id = new.suggester_id;
    perform public.send_group_discord_notification(new.group_id, 'picks_ready', '🎲 The picks are ready', format('**%s** made the %s selection for **%s**. Planned for **%s**. The crew can veto now.', suggester_name, meal_name, group_name, scheduled_label));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'chosen' then
    select restaurant.name into winner_name from public.restaurants restaurant where restaurant.id = new.final_restaurant_id;
    perform public.send_group_discord_notification(new.group_id, 'decision_made', '🏆 Decision made', format('**%s** wins %s for **%s**! Planned for **%s**.', winner_name, meal_name, group_name, scheduled_label));
  elsif tg_op = 'UPDATE' and old.scheduled_for is distinct from new.scheduled_for then
    perform public.send_group_discord_notification(new.group_id, 'schedule_changed', '🗓️ Meal time updated', format('The %s time for **%s** is now **%s**.', meal_name, group_name, scheduled_label));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed' then
    select profile.display_name into next_picker
    from public.group_members member join public.profiles profile on profile.id = member.user_id
    where member.group_id = new.group_id
    order by member.rotation_order
    offset ((select count(*) from public.lunch_sessions where group_id = new.group_id and status = 'completed') % (select count(*) from public.group_members where group_id = new.group_id))
    limit 1;
    perform public.send_group_discord_notification(new.group_id, 'next_turn', '🔁 A new loop can begin', format('Lunch Loop is ready for the next round in **%s**. **%s**, it is your turn to pick.', group_name, next_picker));
  end if;
  return new;
end;
$body$;

revoke all on table public.places_api_usage_events from anon, authenticated;
revoke all on function public.get_my_lunch_loops(), public.is_valid_lunch_loop_time_zone(text), public.save_lunch_loop_home_area(uuid, text, numeric, numeric, smallint, text), public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text), public.enforce_lunch_loop_places_limit(text, uuid), public.get_site_places_usage(integer), public.get_site_places_usage_by_group(integer), public.global_admin_update_places_usage_limits(integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.get_my_lunch_loops(), public.save_lunch_loop_home_area(uuid, text, numeric, numeric, smallint, text), public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text), public.enforce_lunch_loop_places_limit(text, uuid) to authenticated;
grant execute on function public.get_site_places_usage(integer), public.get_site_places_usage_by_group(integer), public.global_admin_update_places_usage_limits(integer, integer, integer, integer, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';
