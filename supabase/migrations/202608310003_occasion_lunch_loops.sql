-- Lunch Loop supports two independent rhythms. Standing loops keep the
-- existing recurring rotation; occasion loops are reusable, one-off plans
-- where the person starting a new night makes that night's picks.

alter table public.groups
  add column if not exists loop_type text not null default 'standing';

update public.groups
set loop_type = 'standing'
where loop_type is null;

alter table public.groups drop constraint if exists groups_loop_type_check;
alter table public.groups add constraint groups_loop_type_check
  check (loop_type in ('standing', 'occasion'));

-- Copy only a member's own restaurant contributions into a new private loop.
-- Activity belongs to its original loop, so visit counts, vetoes, and
-- never-again calls deliberately are not selected here. The advisory lock
-- gives simultaneous joins a stable first-joiner winner for added_by; the
-- target table's (group_id, google_place_id) constraint is the final guard.
create or replace function public.copy_member_restaurants_to_lunch_loop(
  target_group uuid,
  source_member uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare copied_count integer;
begin
  if auth.uid() is null or auth.uid() <> source_member then
    raise exception 'A member may copy only their own restaurant additions';
  end if;
  if not exists(
    select 1 from public.group_members
    where group_id = target_group and user_id = source_member
  ) then
    raise exception 'Join the destination Lunch Loop before copying places';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-place-copy:' || target_group::text, 0)
  );

  insert into public.restaurants(
    group_id,
    google_place_id,
    name,
    address,
    phone,
    hours,
    rating,
    cuisine,
    lat,
    lng,
    added_by
  )
  select
    target_group,
    restaurant.google_place_id,
    restaurant.name,
    restaurant.address,
    restaurant.phone,
    restaurant.hours,
    restaurant.rating,
    restaurant.cuisine,
    restaurant.lat,
    restaurant.lng,
    source_member
  from public.restaurants restaurant
  where restaurant.added_by = source_member
    and restaurant.group_id <> target_group
    and exists(
      select 1 from public.group_members source_membership
      where source_membership.group_id = restaurant.group_id
        and source_membership.user_id = source_member
    )
  on conflict (group_id, google_place_id) do nothing;

  get diagnostics copied_count = row_count;
  return copied_count;
end;
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
  loop_type text,
  owner_display_name text
)
language sql
security definer
set search_path = public, pg_catalog
as $body$
  select
    group_record.id,
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
    group_record.loop_type,
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

drop function if exists public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text);
create function public.redeem_loop_creation_invitation(
  raw_token text,
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
  invitation public.loop_creation_invitations%rowtype;
  account_email text;
  new_group uuid;
  normalized_loop_type text := lower(trim(coalesce(new_loop_type, 'standing')));
begin
  if auth.uid() is null then raise exception 'Sign in before creating a Lunch Loop'; end if;
  if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Give your Lunch Loop a name between 1 and 80 characters'; end if;
  if normalized_loop_type not in ('standing', 'occasion') then raise exception 'Choose a Standing or Occasion Lunch Loop'; end if;
  if char_length(trim(coalesce(new_home_label, ''))) not between 2 and 160 then raise exception 'Choose a city or area for your Lunch Loop'; end if;
  if new_home_lat is null or new_home_lat not between -90 and 90 or new_home_lng is null or new_home_lng not between -180 and 180 then raise exception 'Choose a valid map location for your Lunch Loop'; end if;
  if new_search_radius_miles not between 1 and 35 then raise exception 'Choose a radius from 1 to 35 miles'; end if;
  if not public.is_valid_lunch_loop_time_zone(trim(coalesce(new_time_zone, ''))) then raise exception 'Choose a valid time zone'; end if;

  select lower(email) into account_email from auth.users where id = auth.uid();
  update public.loop_creation_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  select * into invitation
  from public.loop_creation_invitations
  where status = 'pending'
    and expires_at > now()
    and token_hash = encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'That new-loop invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then
    raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email;
  end if;
  if (
    select count(*)
    from public.group_members member
    join public.groups group_record on group_record.id = member.group_id
    where member.user_id = auth.uid()
      and member.role = 'owner'
      and group_record.status = 'active'
  ) >= 2 then
    raise exception 'An account can own up to two active Lunch Loops';
  end if;

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
  ) returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order)
  values (new_group, auth.uid(), 'owner', 0);

  -- An Occasion begins from its owner's existing favorites. A Standing loop
  -- retains its current fresh-database creation behavior.
  if normalized_loop_type = 'occasion' then
    perform public.copy_member_restaurants_to_lunch_loop(new_group, auth.uid());
  end if;

  update public.loop_creation_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), created_group_id = new_group
  where id = invitation.id;
  update public.profiles set active_group_id = new_group where id = auth.uid();
  return new_group;
end;
$body$;

create or replace function public.redeem_group_member_invitation(
  raw_token text,
  raw_code text default null,
  new_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  invitation public.group_member_invitations%rowtype;
  account_email text;
  next_order smallint;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a Lunch Loop'; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  update public.group_member_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  select * into invitation
  from public.group_member_invitations
  where status = 'pending'
    and expires_at > now()
    and (
      (nullif(trim(coalesce(raw_token, '')), '') <> '' and token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex'))
      or
      (nullif(regexp_replace(coalesce(raw_code, ''), '[^A-Za-z0-9]', '', 'g'), '') <> '' and short_code_hash = encode(extensions.digest(upper(regexp_replace(raw_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex'))
    )
  for update;
  if not found then raise exception 'That invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then
    raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email;
  end if;
  if not exists(select 1 from public.groups where id = invitation.group_id and status = 'active') then
    raise exception 'This Lunch Loop is not available';
  end if;
  if not exists(select 1 from public.group_members where group_id = invitation.group_id and user_id = auth.uid())
    and (select count(*) from public.group_members where group_id = invitation.group_id) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;

  perform public.sync_lunch_profile(new_display_name);
  select coalesce(max(rotation_order) + 1, 0)
  into next_order
  from public.group_members
  where group_id = invitation.group_id;
  insert into public.group_members(group_id, user_id, rotation_order)
  values (invitation.group_id, auth.uid(), next_order)
  on conflict (group_id, user_id) do nothing;
  perform public.copy_member_restaurants_to_lunch_loop(invitation.group_id, auth.uid());
  update public.group_member_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;
  update public.profiles set active_group_id = invitation.group_id where id = auth.uid();
  return invitation.group_id;
end;
$body$;

create or replace function public.create_lunch_round(
  target_group uuid,
  restaurant_ids uuid[],
  lunch_time timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  new_session uuid;
  next_suggester uuid;
  member_count integer;
  available_restaurant_count integer;
  target_loop_type text;
  has_any_session boolean;
begin
  if not public.is_group_member(target_group) then raise exception 'You are not a member of this Lunch Loop'; end if;
  if lunch_time <= now() then raise exception 'Choose a meal time in the future'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then raise exception 'There is already an active meal decision'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'chosen') then raise exception 'Close the current meal before starting another one'; end if;

  select loop_type into target_loop_type from public.groups where id = target_group;
  if target_loop_type is null then raise exception 'This Lunch Loop is unavailable'; end if;
  select count(*) into member_count from public.group_members where group_id = target_group;
  select count(*) into available_restaurant_count from public.restaurants where group_id = target_group and not never_again;
  if member_count < 2 then raise exception 'Invite at least one more person before starting a Lunch Loop'; end if;
  if available_restaurant_count < member_count then raise exception 'Add one active place for every group member before starting a Lunch Loop'; end if;
  if coalesce(array_length(restaurant_ids, 1), 0) <> member_count
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> member_count then
    raise exception 'Choose one different restaurant for every group member';
  end if;
  if (select count(*) from public.restaurants where group_id = target_group and id = any(restaurant_ids) and not never_again) <> member_count then
    raise exception 'All choices must be active restaurants in this Lunch Loop';
  end if;

  if target_loop_type = 'occasion' then
    select exists(select 1 from public.lunch_sessions where group_id = target_group) into has_any_session;
    if has_any_session then
      next_suggester := auth.uid();
    else
      select member.user_id into next_suggester
      from public.group_members member
      where member.group_id = target_group and member.role = 'owner'
      order by member.joined_at
      limit 1;
    end if;
  else
    select member.user_id into next_suggester
    from public.group_members member
    where member.group_id = target_group
    order by member.rotation_order
    offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % member_count)
    limit 1;
  end if;
  if next_suggester <> auth.uid() then
    raise exception 'It is another member’s turn to make the picks';
  end if;

  insert into public.lunch_sessions(group_id, suggester_id, scheduled_for)
  values (target_group, next_suggester, lunch_time)
  returning id into new_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id)
  select new_session, selected.restaurant_id
  from unnest(restaurant_ids) as selected(restaurant_id);
  return new_session;
end;
$body$;

-- Occasion sessions still record a winner and visit only when a member closes
-- them after the scheduled time. The existing close function needs no state
-- change; the client and Discord trigger simply do not hand an Occasion to a
-- next picker.
create or replace function public.notify_discord_on_lunch_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  group_name text;
  suggester_name text;
  winner_name text;
  next_picker text;
  meal_name text;
  scheduled_label text;
  target_loop_type text;
begin
  scheduled_label := public.discord_scheduled_time(new.scheduled_for);
  select loop_type into target_loop_type from public.groups where id = new.group_id;
  if tg_op = 'INSERT' and new.status = 'active' then
    select lunch_group.name, profile.display_name, public.discord_meal_name(new.scheduled_for)
    into group_name, suggester_name, meal_name
    from public.groups lunch_group
    join public.profiles profile on profile.id = new.suggester_id
    where lunch_group.id = new.group_id;
    perform public.send_group_discord_notification(
      new.group_id,
      'picks_ready',
      '🎲 The picks are ready',
      format('**%s** made the %s selection for **%s**. Planned for **%s**. The crew can veto now.', suggester_name, meal_name, group_name, scheduled_label)
    );
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'chosen' then
    select lunch_group.name, restaurant.name, public.discord_meal_name(new.scheduled_for)
    into group_name, winner_name, meal_name
    from public.groups lunch_group
    join public.restaurants restaurant on restaurant.id = new.final_restaurant_id
    where lunch_group.id = new.group_id;
    perform public.send_group_discord_notification(
      new.group_id,
      'decision_made',
      '🏆 Decision made',
      format('**%s** wins %s for **%s**! Planned for **%s**.', winner_name, meal_name, group_name, scheduled_label)
    );
  elsif tg_op = 'UPDATE' and old.scheduled_for is distinct from new.scheduled_for then
    select name into group_name from public.groups where id = new.group_id;
    perform public.send_group_discord_notification(
      new.group_id,
      'schedule_changed',
      '🗓️ Meal time updated',
      format('The %s time for **%s** is now **%s**.', public.discord_meal_name(new.scheduled_for), group_name, scheduled_label)
    );
  elsif tg_op = 'UPDATE'
    and old.status is distinct from new.status
    and new.status = 'completed'
    and target_loop_type = 'standing' then
    select profile.display_name into next_picker
    from public.group_members member
    join public.profiles profile on profile.id = member.user_id
    where member.group_id = new.group_id
    order by member.rotation_order
    offset ((select count(*) from public.lunch_sessions where group_id = new.group_id and status = 'completed') % (select count(*) from public.group_members where group_id = new.group_id))
    limit 1;
    select name into group_name from public.groups where id = new.group_id;
    perform public.send_group_discord_notification(
      new.group_id,
      'next_turn',
      '🔁 A new loop can begin',
      format('Lunch Loop is ready for the next round in **%s**. **%s**, it is your turn to pick.', group_name, next_picker)
    );
  end if;
  return new;
end;
$body$;

revoke all on function public.copy_member_restaurants_to_lunch_loop(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_my_lunch_loops() from public, anon, authenticated;
revoke all on function public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text, text) from public, anon, authenticated;
revoke all on function public.redeem_group_member_invitation(text, text, text) from public, anon, authenticated;
revoke all on function public.create_lunch_round(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.get_my_lunch_loops() to authenticated;
grant execute on function public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text, text) to authenticated;
grant execute on function public.redeem_group_member_invitation(text, text, text) to authenticated;
grant execute on function public.create_lunch_round(uuid, uuid[], timestamptz) to authenticated;

create or replace function public.get_lunch_loop_home_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  selected_group record;
  current_session public.lunch_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to use Lunch Loop';
  end if;

  select
    lunch_group.id,
    lunch_group.name,
    lunch_group.loop_type,
    member.role,
    lunch_group.time_zone
  into selected_group
  from public.group_members member
  join public.groups lunch_group on lunch_group.id = member.group_id
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = auth.uid()
    and lunch_group.status = 'active'
  order by (profile.active_group_id = lunch_group.id) desc nulls last,
    lunch_group.created_at desc
  limit 1;

  if selected_group.id is null then
    raise exception 'Create or join an active Lunch Loop first';
  end if;

  select session_record.*
  into current_session
  from public.lunch_sessions session_record
  where session_record.group_id = selected_group.id
    and session_record.status in ('active', 'chosen')
  order by session_record.started_at desc
  limit 1;

  return jsonb_build_object(
    'context', jsonb_build_object(
      'groupId', selected_group.id,
      'groupName', selected_group.name,
      'role', selected_group.role,
      'userId', auth.uid(),
      'timeZone', coalesce(selected_group.time_zone, 'America/Chicago'),
      'loopType', coalesce(selected_group.loop_type, 'standing')
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', roster_member.user_id,
        'rotation_order', roster_member.rotation_order,
        'role', roster_member.role,
        'display_name', coalesce(profile.display_name, 'Lunch friend')
      ) order by roster_member.rotation_order), '[]'::jsonb)
      from public.group_members roster_member
      left join public.profiles profile on profile.id = roster_member.user_id
      where roster_member.group_id = selected_group.id
    ),
    'restaurants', (
      select coalesce(jsonb_agg(to_jsonb(restaurant) order by restaurant.name), '[]'::jsonb)
      from public.restaurants restaurant
      where restaurant.group_id = selected_group.id
    ),
    'completed_count', (
      select count(*)
      from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id
        and session_record.status = 'completed'
    ),
    'last_lunch', (
      select jsonb_build_object(
        'restaurant_id', session_record.final_restaurant_id,
        'scheduled_for', session_record.scheduled_for
      )
      from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id
        and session_record.status = 'completed'
        and session_record.final_restaurant_id is not null
      order by session_record.scheduled_for desc
      limit 1
    ),
    'current', case when current_session.id is null then null else jsonb_build_object(
      'id', current_session.id,
      'status', current_session.status,
      'scheduled_for', current_session.scheduled_for,
      'final_restaurant_id', current_session.final_restaurant_id,
      'suggester_id', current_session.suggester_id
    ) end,
    'candidates', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'restaurant_id', candidate.restaurant_id
      ) order by candidate.added_at), '[]'::jsonb)
      from public.lunch_session_candidates candidate
      where candidate.session_id = current_session.id
    ) end,
    'vetoes', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'candidate_id', veto.candidate_id,
        'user_id', veto.user_id
      ) order by veto.created_at), '[]'::jsonb)
      from public.vetoes veto
      where veto.session_id = current_session.id
    ) end
  );
end;
$body$;

revoke all on function public.get_lunch_loop_home_snapshot() from public, anon, authenticated;
grant execute on function public.get_lunch_loop_home_snapshot() to authenticated;

notify pgrst, 'reload schema';
