-- Security hardening: lock down RPC execution, prevent direct workflow-table
-- mutation, use high-entropy invites, and rate-limit group creation/joining.

create table if not exists public.user_action_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action_name text not null check (action_name in ('create_group', 'join_group')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  primary key (user_id, action_name)
);
alter table public.user_action_rate_limits enable row level security;

create or replace function public.enforce_user_rate_limit(action_name text, maximum_attempts integer, period interval)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare current_limit public.user_action_rate_limits%rowtype;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if maximum_attempts < 1 or period <= interval '0 seconds' then raise exception 'Invalid rate limit configuration'; end if;

  select * into current_limit
  from public.user_action_rate_limits
  where user_id = auth.uid() and action_name = enforce_user_rate_limit.action_name
  for update;

  if not found then
    insert into public.user_action_rate_limits(user_id, action_name, attempts) values (auth.uid(), action_name, 1);
  elsif current_limit.window_started_at + period <= now() then
    update public.user_action_rate_limits set window_started_at = now(), attempts = 1
    where user_id = auth.uid() and action_name = enforce_user_rate_limit.action_name;
  elsif current_limit.attempts >= maximum_attempts then
    raise exception 'Too many attempts. Please wait and try again.';
  else
    update public.user_action_rate_limits set attempts = attempts + 1
    where user_id = auth.uid() and action_name = enforce_user_rate_limit.action_name;
  end if;
end;
$$;

alter table public.groups alter column invite_code set default upper(replace(gen_random_uuid()::text, '-', ''));
update public.groups set invite_code = upper(replace(gen_random_uuid()::text, '-', '')) where invite_code !~ '^[A-F0-9]{32}$';
alter table public.groups drop constraint if exists groups_invite_code_format_check;
alter table public.groups add constraint groups_invite_code_format_check check (invite_code ~ '^[A-F0-9]{32}$');

create or replace function public.create_lunch_group(group_name text, display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare new_group uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  perform public.enforce_user_rate_limit('create_group', 3, interval '1 hour');
  if not coalesce((select allow_new_groups from public.site_settings where singleton), true) and not public.is_site_admin() then
    raise exception 'New lunch groups are not available right now';
  end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  insert into public.groups(name) values (trim(group_name)) returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  return new_group;
end;
$$;

create or replace function public.join_lunch_group(group_invite_code text, display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare target_group uuid; next_order smallint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  perform public.enforce_user_rate_limit('join_group', 12, interval '15 minutes');
  select id into target_group from public.groups where invite_code = upper(trim(group_invite_code)) and status = 'active';
  if target_group is null then raise exception 'That invite code was not found or the lunch group is unavailable'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  select coalesce(max(rotation_order) + 1, 0) into next_order from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, rotation_order) values (target_group, auth.uid(), next_order) on conflict (group_id, user_id) do nothing;
  return target_group;
end;
$$;

create or replace function public.global_admin_update_group(
  target_group uuid,
  new_name text,
  new_status text,
  new_suspension_reason text,
  regenerate_invite boolean default false
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if char_length(trim(new_name)) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters'; end if;
  if new_status not in ('active', 'suspended') then raise exception 'Choose an active or suspended group status'; end if;
  update public.groups
  set name = trim(new_name),
      status = new_status,
      suspended_reason = case when new_status = 'suspended' then nullif(trim(new_suspension_reason), '') else null end,
      suspended_at = case when new_status = 'suspended' then now() else null end,
      invite_code = case when regenerate_invite then upper(replace(gen_random_uuid()::text, '-', '')) else invite_code end
  where id = target_group;
  if not found then raise exception 'Lunch group was not found'; end if;
end;
$$;

create or replace function public.add_restaurants_to_group(target_group uuid, places jsonb)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare inserted_count integer;
begin
  if not public.is_group_member(target_group) then raise exception 'You are not a member of this lunch group'; end if;
  if jsonb_typeof(places) <> 'array' or jsonb_array_length(places) not between 1 and 12 then
    raise exception 'Add between one and 12 places at a time';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(places) as place(google_place_id text, name text, address text, phone text, hours jsonb, rating numeric, cuisine text, lat numeric, lng numeric)
    where place.google_place_id !~ '^[A-Za-z0-9_-]{10,255}$'
      or char_length(trim(coalesce(place.name, ''))) not between 1 and 160
      or char_length(trim(coalesce(place.address, ''))) not between 1 and 350
      or (place.phone is not null and char_length(place.phone) > 50)
      or (place.cuisine is not null and char_length(place.cuisine) > 100)
      or (place.rating is not null and place.rating not between 0 and 5)
      or (place.lat is not null and place.lat not between -90 and 90)
      or (place.lng is not null and place.lng not between -180 and 180)
      or (place.hours is not null and jsonb_typeof(place.hours) <> 'array')
  ) then
    raise exception 'One or more places contains invalid data';
  end if;

  with new_places as (
    insert into public.restaurants(group_id, google_place_id, name, address, phone, hours, rating, cuisine, lat, lng, added_by)
    select target_group, place.google_place_id, trim(place.name), trim(place.address), nullif(trim(place.phone), ''), coalesce(place.hours, '[]'::jsonb), place.rating, nullif(trim(place.cuisine), ''), place.lat, place.lng, auth.uid()
    from jsonb_to_recordset(places) as place(google_place_id text, name text, address text, phone text, hours jsonb, rating numeric, cuisine text, lat numeric, lng numeric)
    on conflict (group_id, google_place_id) do nothing
    returning id
  ) select count(*) into inserted_count from new_places;
  return inserted_count;
end;
$$;

create or replace function public.cast_lunch_veto(target_session uuid, target_candidate uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare session_group uuid; session_suggester uuid;
begin
  select group_id, suggester_id into session_group, session_suggester
  from public.lunch_sessions
  where id = target_session and status = 'active'
  for update;
  if session_group is null or not public.is_group_member(session_group) then raise exception 'This lunch decision is not available'; end if;
  if session_suggester = auth.uid() then raise exception 'The suggester does not get a veto'; end if;
  if not exists(select 1 from public.lunch_session_candidates where id = target_candidate and session_id = target_session) then
    raise exception 'That restaurant is not part of this lunch decision';
  end if;
  if exists(select 1 from public.vetoes where session_id = target_session and user_id = auth.uid()) then
    raise exception 'You have already used your veto for this lunch decision';
  end if;
  if exists(select 1 from public.vetoes where session_id = target_session and candidate_id = target_candidate) then
    raise exception 'That restaurant was already vetoed';
  end if;
  insert into public.vetoes(session_id, candidate_id, user_id) values (target_session, target_candidate, auth.uid());
end;
$$;

create or replace function public.finalize_lunch_session(target_session uuid, winning_restaurant uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare session_group uuid; survivor_count integer;
begin
  select group_id into session_group from public.lunch_sessions where id = target_session and status = 'active' for update;
  if session_group is null or not public.is_group_member(session_group) then raise exception 'Lunch decision is not available'; end if;
  select count(*) into survivor_count
  from public.lunch_session_candidates candidate
  where candidate.session_id = target_session
    and not exists(select 1 from public.vetoes veto where veto.session_id = target_session and veto.candidate_id = candidate.id);
  if survivor_count <> 1 then raise exception 'A lunch decision can only finalize when exactly one choice remains'; end if;
  if not exists(
    select 1 from public.lunch_session_candidates candidate
    where candidate.session_id = target_session and candidate.restaurant_id = winning_restaurant
      and not exists(select 1 from public.vetoes veto where veto.session_id = target_session and veto.candidate_id = candidate.id)
  ) then raise exception 'The winner must be the one remaining choice'; end if;
  update public.lunch_sessions set status = 'chosen', final_restaurant_id = winning_restaurant where id = target_session;
end;
$$;

drop policy if exists "members add restaurants" on public.restaurants;
drop policy if exists "members edit restaurants" on public.restaurants;
create policy "owners edit restaurants" on public.restaurants for update
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));
drop policy if exists "members add candidates" on public.lunch_session_candidates;
drop policy if exists "members add own vetoes" on public.vetoes;

drop function if exists public.complete_lunch_session(uuid, uuid);
drop function if exists public.start_lunch_session(uuid);

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid), public.is_site_admin() to anon, authenticated;
grant execute on function public.create_lunch_group(text, text), public.join_lunch_group(text, text), public.create_lunch_round(uuid, uuid[], timestamptz), public.update_lunch_round_choices(uuid, uuid[]), public.update_lunch_schedule(uuid, timestamptz), public.cast_lunch_veto(uuid, uuid), public.finalize_lunch_session(uuid, uuid), public.close_lunch_loop(uuid), public.add_restaurants_to_group(uuid, jsonb), public.save_lunch_group_roster(uuid, uuid[], text[]), public.get_group_discord_notification_settings(uuid), public.save_group_discord_notification_settings(uuid, text, boolean, text[]), public.remove_group_discord_notification_settings(uuid), public.send_test_group_discord_notification(uuid), public.global_admin_update_site_settings(boolean), public.global_admin_update_group(uuid, text, text, text, boolean), public.global_admin_set_group_owner(uuid, uuid), public.global_admin_remove_group_member(uuid, uuid), public.global_admin_cancel_lunch_session(uuid), public.global_admin_set_site_admin(uuid, boolean) to authenticated;
