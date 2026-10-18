-- Global Admin growth controls: one durable, configurable owned-loop cap;
-- Google profile names for administrator search; and loop/decision reporting
-- data exposed through existing authorized reads only.

alter table public.site_settings
  add column if not exists owned_loop_limit integer not null default 4;

alter table public.site_settings
  drop constraint if exists site_settings_owned_loop_limit_check;
alter table public.site_settings
  add constraint site_settings_owned_loop_limit_check
  check (owned_loop_limit between 1 and 20);

update public.site_settings
set owned_loop_limit = 4
where singleton;

alter table public.user_account_identities
  add column if not exists google_full_name text;

update public.user_account_identities identity_record
set google_full_name = nullif(trim(coalesce(
  account.raw_user_meta_data ->> 'full_name',
  account.raw_user_meta_data ->> 'name',
  ''
)), '')
from auth.users account
where account.id = identity_record.user_id;

create or replace function public.sync_lunch_profile(new_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  account auth.users%rowtype;
  safe_name text;
  google_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into account from auth.users where id = auth.uid();
  safe_name := nullif(trim(coalesce(new_display_name, '')), '');
  google_name := nullif(trim(coalesce(
    account.raw_user_meta_data ->> 'full_name',
    account.raw_user_meta_data ->> 'name',
    ''
  )), '');
  if safe_name is not null and char_length(safe_name) not between 1 and 50 then
    raise exception 'Display name must be between 1 and 50 characters';
  end if;
  insert into public.profiles(id, display_name)
  values (auth.uid(), coalesce(safe_name, google_name, 'Lunch friend'))
  on conflict (id) do update set display_name = coalesce(safe_name, public.profiles.display_name);
  insert into public.user_account_identities(user_id, email, provider, avatar_url, google_full_name, last_synced_at)
  values (
    auth.uid(),
    nullif(lower(account.email), ''),
    coalesce(account.raw_app_meta_data ->> 'provider', 'email'),
    coalesce(account.raw_user_meta_data ->> 'avatar_url', account.raw_user_meta_data ->> 'picture'),
    google_name,
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    provider = excluded.provider,
    avatar_url = excluded.avatar_url,
    google_full_name = excluded.google_full_name,
    last_synced_at = now();
end;
$body$;

create or replace function public.enforce_lunch_loop_member_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  max_owned_loops integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-member-limit:' || new.group_id::text, 0));
  if tg_op = 'INSERT' and exists (
    select 1 from public.group_members existing_member
    where existing_member.group_id = new.group_id and existing_member.user_id = new.user_id
  ) then return new; end if;
  if tg_op = 'INSERT' and (select count(*) from public.group_members member where member.group_id = new.group_id) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;
  if new.role = 'owner' and (tg_op = 'INSERT' or old.role is distinct from 'owner') then
    perform pg_advisory_xact_lock(hashtextextended('lunch-loop-owner-limit:' || new.user_id::text, 0));
    select owned_loop_limit into max_owned_loops from public.site_settings where singleton;
    max_owned_loops := coalesce(max_owned_loops, 4);
    if (
      select count(*) from public.group_members member
      join public.groups lunch_group on lunch_group.id = member.group_id
      where member.user_id = new.user_id and member.role = 'owner'
        and lunch_group.status = 'active' and lunch_group.id <> new.group_id
    ) >= max_owned_loops then
      raise exception 'An account can own up to % active Lunch Loops', max_owned_loops;
    end if;
  end if;
  return new;
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
language sql security definer set search_path = public, pg_catalog
as $body$
  select group_record.id, group_record.name, member.role, group_record.status,
    coalesce(profile.active_group_id = group_record.id, false),
    (select count(*) from public.group_members each_member where each_member.group_id = group_record.id),
    group_record.created_at, group_record.delete_scheduled_for,
    group_record.home_label, group_record.home_lat, group_record.home_lng,
    group_record.search_radius_miles, group_record.time_zone, group_record.loop_type,
    coalesce((
      select owner_profile.display_name
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

create or replace function public.redeem_loop_creation_invitation(
  raw_token text, new_group_name text, new_display_name text, new_home_label text,
  new_home_lat numeric, new_home_lng numeric, new_search_radius_miles smallint,
  new_time_zone text, new_loop_type text default 'standing'
)
returns uuid language plpgsql security definer set search_path = public, auth, pg_catalog
as $body$
declare
  invitation public.loop_creation_invitations%rowtype;
  account_email text;
  new_group uuid;
  normalized_loop_type text := lower(trim(coalesce(new_loop_type, 'standing')));
  max_owned_loops integer;
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
  select * into invitation from public.loop_creation_invitations
    where status = 'pending' and expires_at > now()
      and token_hash = encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex')
    for update;
  if not found then raise exception 'That new-loop invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email; end if;
  select owned_loop_limit into max_owned_loops from public.site_settings where singleton;
  max_owned_loops := coalesce(max_owned_loops, 4);
  if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= max_owned_loops then
    raise exception 'An account can own up to % active Lunch Loops', max_owned_loops;
  end if;
  perform public.sync_lunch_profile(new_display_name);
  insert into public.groups(name, home_label, home_lat, home_lng, search_radius_miles, time_zone, loop_type)
  values (trim(new_group_name), trim(new_home_label), new_home_lat, new_home_lng, new_search_radius_miles, trim(new_time_zone), normalized_loop_type)
  returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  if normalized_loop_type = 'occasion' then perform public.copy_member_restaurants_to_lunch_loop(new_group, auth.uid()); end if;
  update public.loop_creation_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), created_group_id = new_group where id = invitation.id;
  update public.profiles set active_group_id = new_group where id = auth.uid();
  return new_group;
end;
$body$;

create or replace function public.restore_archived_lunch_loop(target_group uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $body$
declare max_owned_loops integer;
begin
  if not exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and role = 'owner') then raise exception 'Only this Lunch Loop''s owner can restore it'; end if;
  select owned_loop_limit into max_owned_loops from public.site_settings where singleton;
  max_owned_loops := coalesce(max_owned_loops, 4);
  if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= max_owned_loops then
    raise exception 'An account can own up to % active Lunch Loops', max_owned_loops;
  end if;
  update public.groups set status = 'active', archived_at = null, archived_by = null, delete_scheduled_for = null where id = target_group and status = 'archived';
  if not found then raise exception 'That archived Lunch Loop is not available'; end if;
  update public.profiles set active_group_id = target_group where id = auth.uid();
end;
$body$;

create or replace function public.global_admin_create_lunch_group_for_request(target_user uuid, new_group_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog
as $body$
declare new_group uuid; max_owned_loops integer;
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters'; end if;
  if not exists(select 1 from public.lunch_loop_invite_requests where user_id = target_user and status in ('new', 'reviewed', 'invited')) then raise exception 'Create a crew only for an active invite request'; end if;
  select owned_loop_limit into max_owned_loops from public.site_settings where singleton;
  max_owned_loops := coalesce(max_owned_loops, 4);
  if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = target_user and member.role = 'owner' and group_record.status = 'active') >= max_owned_loops then raise exception 'This account already owns % active Lunch Loops', max_owned_loops; end if;
  insert into public.groups(name) values (trim(new_group_name)) returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, target_user, 'owner', 0);
  update public.profiles set active_group_id = new_group where id = target_user;
  update public.lunch_loop_invite_requests set status = 'invited', reviewed_at = now(), reviewed_by = auth.uid() where user_id = target_user;
  return jsonb_build_object('group_id', new_group);
end;
$body$;

create or replace function public.global_admin_update_owned_loop_limit(new_limit integer)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $body$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if new_limit not between 1 and 20 then raise exception 'Set an owned-loop limit from 1 to 20'; end if;
  update public.site_settings set owned_loop_limit = new_limit, updated_at = now(), updated_by = auth.uid() where singleton;
end;
$body$;

drop function if exists public.search_site_lunch_loop_users(text);
create function public.search_site_lunch_loop_users(search_term text)
returns table(user_id uuid, display_name text, google_full_name text, account_email text)
language plpgsql security definer set search_path = public, pg_catalog
as $body$
declare normalized_term text := lower(trim(coalesce(search_term, '')));
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if char_length(normalized_term) < 2 then return; end if;
  return query
  select profile.id, profile.display_name, identity.google_full_name, identity.email
  from public.profiles profile
  left join public.user_account_identities identity on identity.user_id = profile.id
  where lower(profile.display_name) like '%' || normalized_term || '%'
     or lower(coalesce(identity.google_full_name, '')) like '%' || normalized_term || '%'
     or lower(coalesce(identity.email, '')) like '%' || normalized_term || '%'
  order by case
    when lower(coalesce(identity.google_full_name, '')) = normalized_term then 0
    when lower(profile.display_name) = normalized_term then 1
    else 2 end,
    profile.display_name
  limit 20;
end;
$body$;

revoke all on function public.sync_lunch_profile(text) from public, anon, authenticated;
revoke all on function public.enforce_lunch_loop_member_limits() from public, anon, authenticated;
revoke all on function public.get_my_lunch_loops() from public, anon, authenticated;
revoke all on function public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text, text) from public, anon, authenticated;
revoke all on function public.restore_archived_lunch_loop(uuid) from public, anon, authenticated;
revoke all on function public.global_admin_create_lunch_group_for_request(uuid, text) from public, anon, authenticated;
revoke all on function public.global_admin_update_owned_loop_limit(integer) from public, anon, authenticated;
revoke all on function public.search_site_lunch_loop_users(text) from public, anon, authenticated;
grant execute on function public.get_my_lunch_loops() to authenticated;
grant execute on function public.redeem_loop_creation_invitation(text, text, text, text, numeric, numeric, smallint, text, text) to authenticated;
grant execute on function public.restore_archived_lunch_loop(uuid) to authenticated;
grant execute on function public.global_admin_create_lunch_group_for_request(uuid, text) to authenticated;
grant execute on function public.global_admin_update_owned_loop_limit(integer) to authenticated;
grant execute on function public.search_site_lunch_loop_users(text) to authenticated;

notify pgrst, 'reload schema';
