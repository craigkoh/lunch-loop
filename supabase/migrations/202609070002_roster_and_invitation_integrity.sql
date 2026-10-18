-- Keep a Lunch Loop's crew stable while a meal decision is underway, reserve
-- every remaining seat across both invitation channels, and scope roster names
-- to the Lunch Loop rather than the Google account.

alter table public.group_members
  add column if not exists nickname text;

alter table public.group_members
  drop constraint if exists group_members_nickname_length_check;
alter table public.group_members
  add constraint group_members_nickname_length_check
  check (nickname is null or char_length(trim(nickname)) between 1 and 50);

-- Preserve the labels each crew sees today before future roster edits become
-- loop-scoped. New memberships fall back to the person's account display name.
update public.group_members member
set nickname = profile.display_name
from public.profiles profile
where profile.id = member.user_id
  and member.nickname is null;

create or replace function public.save_lunch_group_roster(
  target_group uuid,
  member_ids uuid[],
  display_names text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  owner_id uuid := auth.uid();
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only the Lunch Loop owner can manage the crew';
  end if;

  -- Match the lock taken by create_lunch_round and all membership inserts so
  -- the decision count, picker order, and voter list always change together.
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-roster:' || target_group::text, 0)
  );

  if exists(
    select 1 from public.lunch_sessions
    where group_id = target_group and status in ('active', 'chosen')
  ) then
    raise exception 'Finish or cancel the current meal decision before changing the crew';
  end if;

  if coalesce(array_length(member_ids, 1), 0) not between 2 and 6
    or array_length(member_ids, 1) <> array_length(display_names, 1)
    or (select count(distinct roster_member.member_id)
        from unnest(member_ids) as roster_member(member_id)) <> array_length(member_ids, 1)
    or not owner_id = any(member_ids) then
    raise exception 'Keep the owner and between two and six people in this Lunch Loop';
  end if;
  if exists(
    select 1 from unnest(display_names) as display_name
    where char_length(trim(display_name)) not between 1 and 50
  ) then
    raise exception 'Each crew name must be between 1 and 50 characters';
  end if;
  if (select count(*) from public.group_members
      where group_id = target_group and user_id = any(member_ids)) <> array_length(member_ids, 1) then
    raise exception 'Crew members must already belong to this Lunch Loop';
  end if;

  -- A nickname belongs to this Lunch Loop only. Never overwrite the same
  -- person's account name or their label in another Lunch Loop.
  update public.group_members member
  set nickname = trim(roster.display_name)
  from unnest(member_ids, display_names) as roster(member_id, display_name)
  where member.group_id = target_group and member.user_id = roster.member_id;

  delete from public.group_members
  where group_id = target_group and user_id <> all(member_ids);

  update public.group_members
  set rotation_order = rotation_order + 1000
  where group_id = target_group;
  update public.group_members member
  set rotation_order = roster.position - 1
  from unnest(member_ids) with ordinality as roster(member_id, position)
  where member.group_id = target_group and member.user_id = roster.member_id;
end;
$body$;

create or replace function public.global_admin_remove_group_member(
  target_group uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-roster:' || target_group::text, 0)
  );
  if exists(
    select 1 from public.lunch_sessions
    where group_id = target_group and status in ('active', 'chosen')
  ) then
    raise exception 'Cancel or finish the current meal decision before changing the crew';
  end if;
  if (select count(*) from public.group_members where group_id = target_group) <= 2 then
    raise exception 'A Lunch Loop must keep at least two people';
  end if;
  if exists(
    select 1 from public.group_members
    where group_id = target_group and user_id = target_user and role = 'owner'
  ) and (select count(*) from public.group_members
         where group_id = target_group and role = 'owner') <= 1 then
    raise exception 'Choose another owner before removing the current owner';
  end if;

  delete from public.group_members
  where group_id = target_group and user_id = target_user;
  if not found then
    raise exception 'That person is not in this Lunch Loop';
  end if;

  update public.group_members
  set rotation_order = rotation_order + 1000
  where group_id = target_group;
  with reordered as (
    select user_id, row_number() over (order by rotation_order) - 1 as next_order
    from public.group_members
    where group_id = target_group
  )
  update public.group_members member
  set rotation_order = reordered.next_order
  from reordered
  where member.group_id = target_group and member.user_id = reordered.user_id;
end;
$body$;

create or replace function public.create_group_member_invitation(
  target_group uuid,
  target_email text
)
returns table(invitation_id uuid, invitation_token text, short_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  raw_token text;
  raw_code text;
  code_hash text;
  invitation_record uuid;
  expiry timestamptz;
  normalized_email text;
  open_seats integer;
begin
  if auth.uid() is null or not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can invite a crew member';
  end if;
  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not accepting invitations';
  end if;
  normalized_email := lower(trim(coalesce(target_email, '')));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  perform public.ensure_lunch_loop_invite_limit(target_group);
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-share-invite:' || target_group::text, 0)
  );

  update public.group_member_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  update public.group_member_share_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  select 6 - count(*)::integer into open_seats
  from public.group_members
  where group_id = target_group;
  if open_seats <= 0 then
    raise exception 'This Lunch Loop already has its six members';
  end if;
  if exists(
    select 1 from public.group_member_invitations invitation
    where invitation.group_id = target_group
      and invitation.recipient_email = normalized_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'That email already has a pending Lunch Loop invitation';
  end if;
  if (
    (select count(*) from public.group_member_invitations invitation
      where invitation.group_id = target_group
        and invitation.status = 'pending'
        and invitation.expires_at > now())
    +
    (select count(*) from public.group_member_share_invitations invitation
      where invitation.group_id = target_group
        and invitation.status = 'pending'
        and invitation.expires_at > now())
  ) >= open_seats then
    raise exception 'Every remaining crew spot already has an active invitation';
  end if;

  raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  loop
    raw_code := '';
    for character_position in 1..12 loop
      raw_code := raw_code || substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1,
        1
      );
    end loop;
    code_hash := encode(extensions.digest(raw_code, 'sha256'), 'hex');
    exit when not exists(
      select 1 from public.group_member_invitations where short_code_hash = code_hash
      union all
      select 1 from public.group_member_share_invitations where short_code_hash = code_hash
    );
  end loop;

  expiry := now() + interval '14 days';
  insert into public.group_member_invitations(
    group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at
  ) values (
    target_group, auth.uid(), normalized_email,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), code_hash, expiry
  ) returning id into invitation_record;
  return query select invitation_record, raw_token,
    substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4),
    expiry;
end;
$body$;

create or replace function public.create_group_member_share_invitation(
  target_group uuid,
  invite_label text default null
)
returns table(invitation_id uuid, short_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  raw_code text;
  formatted_code text;
  code_hash text;
  invitation_record uuid;
  expiry timestamptz;
  normalized_label text;
  open_seats integer;
begin
  if auth.uid() is null or not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can create a shareable invite';
  end if;
  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not accepting invitations';
  end if;
  normalized_label := nullif(trim(coalesce(invite_label, '')), '');
  if normalized_label is not null and char_length(normalized_label) > 80 then
    raise exception 'Keep the invite name to 80 characters or fewer';
  end if;
  perform public.ensure_lunch_loop_invite_limit(target_group);
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-share-invite:' || target_group::text, 0)
  );

  update public.group_member_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  update public.group_member_share_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  select 6 - count(*)::integer into open_seats
  from public.group_members
  where group_id = target_group;
  if open_seats <= 0 then
    raise exception 'This Lunch Loop already has its six members';
  end if;
  if (
    (select count(*) from public.group_member_invitations invitation
      where invitation.group_id = target_group
        and invitation.status = 'pending'
        and invitation.expires_at > now())
    +
    (select count(*) from public.group_member_share_invitations invitation
      where invitation.group_id = target_group
        and invitation.status = 'pending'
        and invitation.expires_at > now())
  ) >= open_seats then
    raise exception 'Every remaining crew spot already has an active invitation';
  end if;

  loop
    raw_code := '';
    for character_position in 1..12 loop
      raw_code := raw_code || substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1,
        1
      );
    end loop;
    code_hash := encode(extensions.digest(raw_code, 'sha256'), 'hex');
    exit when not exists(
      select 1 from public.group_member_invitations where short_code_hash = code_hash
      union all
      select 1 from public.group_member_share_invitations where short_code_hash = code_hash
    );
  end loop;

  expiry := now() + interval '14 days';
  insert into public.group_member_share_invitations(
    group_id, invited_by, invite_label, short_code_hash, expires_at
  ) values (target_group, auth.uid(), normalized_label, code_hash, expiry)
  returning id into invitation_record;
  formatted_code := substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4);
  return query select invitation_record, formatted_code, expiry;
end;
$body$;

create or replace function public.get_group_member_directory(target_group uuid)
returns table(
  user_id uuid, rotation_order smallint, role text, display_name text,
  joined_at timestamptz, account_email text, auth_provider text, avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare can_view_accounts boolean;
begin
  if not public.is_group_member(target_group) then
    raise exception 'This Lunch Loop is not available';
  end if;
  can_view_accounts := public.is_group_owner(target_group) or public.is_site_admin();
  return query
  select
    member.user_id,
    member.rotation_order,
    member.role,
    coalesce(nullif(member.nickname, ''), profile.display_name, 'Lunch friend'),
    member.joined_at,
    case when can_view_accounts or member.user_id = auth.uid() then identity.email else null end,
    case when can_view_accounts or member.user_id = auth.uid() then identity.provider else null end,
    case when can_view_accounts or member.user_id = auth.uid() then identity.avatar_url else null end
  from public.group_members member
  join public.profiles profile on profile.id = member.user_id
  left join public.user_account_identities identity on identity.user_id = member.user_id
  where member.group_id = target_group
  order by member.rotation_order;
end;
$body$;

drop function if exists public.get_my_lunch_loops();
create function public.get_my_lunch_loops()
returns table(
  group_id uuid, group_name text, role text, status text, active boolean,
  member_count bigint, created_at timestamptz, delete_scheduled_for timestamptz,
  home_label text, home_lat numeric, home_lng numeric, search_radius_miles smallint,
  time_zone text, loop_type text, owner_display_name text, owned_loop_limit integer
)
language sql
security definer
set search_path = public, pg_catalog
as $body$
  select group_record.id, group_record.name, member.role, group_record.status,
    coalesce(profile.active_group_id = group_record.id, false),
    (select count(*) from public.group_members each_member where each_member.group_id = group_record.id),
    group_record.created_at, group_record.delete_scheduled_for,
    group_record.home_label, group_record.home_lat, group_record.home_lng,
    group_record.search_radius_miles, group_record.time_zone, group_record.loop_type,
    coalesce((
      select coalesce(nullif(owner_member.nickname, ''), owner_profile.display_name)
      from public.group_members owner_member
      join public.profiles owner_profile on owner_profile.id = owner_member.user_id
      where owner_member.group_id = group_record.id and owner_member.role = 'owner'
      order by owner_member.joined_at limit 1
    ), 'Lunch Loop owner'),
    coalesce((select setting.owned_loop_limit from public.site_settings setting where setting.singleton), 4)
  from public.group_members member
  join public.groups group_record on group_record.id = member.group_id
  join public.profiles profile on profile.id = auth.uid()
  where member.user_id = auth.uid()
  order by (profile.active_group_id = group_record.id) desc nulls last, group_record.created_at desc
$body$;

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
  if auth.uid() is null then raise exception 'Sign in to use Lunch Loop'; end if;
  select lunch_group.id, lunch_group.name, lunch_group.loop_type, member.role, lunch_group.time_zone
  into selected_group
  from public.group_members member
  join public.groups lunch_group on lunch_group.id = member.group_id
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = auth.uid() and lunch_group.status = 'active'
  order by (profile.active_group_id = lunch_group.id) desc nulls last, lunch_group.created_at desc
  limit 1;
  if selected_group.id is null then raise exception 'Create or join an active Lunch Loop first'; end if;
  select session_record.* into current_session
  from public.lunch_sessions session_record
  where session_record.group_id = selected_group.id and session_record.status in ('active', 'chosen')
  order by session_record.started_at desc limit 1;
  return jsonb_build_object(
    'context', jsonb_build_object(
      'groupId', selected_group.id, 'groupName', selected_group.name,
      'role', selected_group.role, 'userId', auth.uid(),
      'timeZone', coalesce(selected_group.time_zone, 'America/Chicago'),
      'loopType', coalesce(selected_group.loop_type, 'standing')
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', roster_member.user_id, 'rotation_order', roster_member.rotation_order,
        'role', roster_member.role,
        'display_name', coalesce(nullif(roster_member.nickname, ''), profile.display_name, 'Lunch friend')
      ) order by roster_member.rotation_order), '[]'::jsonb)
      from public.group_members roster_member
      left join public.profiles profile on profile.id = roster_member.user_id
      where roster_member.group_id = selected_group.id
    ),
    'restaurants', (
      select coalesce(jsonb_agg(to_jsonb(restaurant) order by restaurant.name), '[]'::jsonb)
      from public.restaurants restaurant where restaurant.group_id = selected_group.id
    ),
    'completed_count', (
      select count(*) from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id and session_record.status = 'completed'
    ),
    'last_lunch', (
      select jsonb_build_object('restaurant_id', session_record.final_restaurant_id, 'scheduled_for', session_record.scheduled_for)
      from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id and session_record.status = 'completed'
        and session_record.final_restaurant_id is not null
      order by session_record.scheduled_for desc limit 1
    ),
    'current', case when current_session.id is null then null else jsonb_build_object(
      'id', current_session.id, 'status', current_session.status,
      'scheduled_for', current_session.scheduled_for,
      'final_restaurant_id', current_session.final_restaurant_id,
      'suggester_id', current_session.suggester_id
    ) end,
    'candidates', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('id', candidate.id, 'restaurant_id', candidate.restaurant_id) order by candidate.added_at), '[]'::jsonb)
      from public.lunch_session_candidates candidate where candidate.session_id = current_session.id
    ) end,
    'vetoes', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('candidate_id', veto.candidate_id, 'user_id', veto.user_id) order by veto.created_at), '[]'::jsonb)
      from public.vetoes veto where veto.session_id = current_session.id
    ) end
  );
end;
$body$;

revoke all on function public.get_group_member_directory(uuid) from public, anon;
revoke all on function public.get_lunch_loop_home_snapshot() from public, anon;
revoke all on function public.get_my_lunch_loops() from public, anon;
grant execute on function public.save_lunch_group_roster(uuid, uuid[], text[]) to authenticated;
grant execute on function public.global_admin_remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.create_group_member_invitation(uuid, text) to authenticated;
grant execute on function public.create_group_member_share_invitation(uuid, text) to authenticated;
grant execute on function public.get_group_member_directory(uuid) to authenticated;
grant execute on function public.get_lunch_loop_home_snapshot() to authenticated;
grant execute on function public.get_my_lunch_loops() to authenticated;

notify pgrst, 'reload schema';
