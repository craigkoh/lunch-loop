-- Email magic-link accounts have no Google name or photo. Profile sync falls
-- back to the email local part, and email-bound invitations accept that same
-- account email whether the person used Google or a one-time email link.

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
  email_local text;
  avatar text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select * into account from auth.users where id = auth.uid();
  safe_name := nullif(trim(coalesce(new_display_name, '')), '');
  google_name := nullif(trim(coalesce(
    account.raw_user_meta_data ->> 'full_name',
    account.raw_user_meta_data ->> 'name',
    ''
  )), '');
  email_local := nullif(left(trim(split_part(coalesce(account.email, ''), '@', 1)), 50), '');
  avatar := nullif(trim(coalesce(
    account.raw_user_meta_data ->> 'avatar_url',
    account.raw_user_meta_data ->> 'picture',
    ''
  )), '');
  if safe_name is not null and char_length(safe_name) not between 1 and 50 then
    raise exception 'Display name must be between 1 and 50 characters';
  end if;
  insert into public.profiles(id, display_name)
  values (auth.uid(), coalesce(safe_name, google_name, email_local, 'Lunch friend'))
  on conflict (id) do update set display_name = coalesce(
    safe_name,
    case
      when public.profiles.display_name = 'Lunch friend'
        then coalesce(google_name, email_local, public.profiles.display_name)
      else public.profiles.display_name
    end
  );
  insert into public.user_account_identities(user_id, email, provider, avatar_url, google_full_name, last_synced_at)
  values (
    auth.uid(),
    nullif(lower(account.email), ''),
    coalesce(account.raw_app_meta_data ->> 'provider', 'email'),
    avatar,
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

revoke all on function public.sync_lunch_profile(text) from public, anon, authenticated;

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
  email_invitation public.group_member_invitations%rowtype;
  share_invitation public.group_member_share_invitations%rowtype;
  account_email text;
  normalized_code text;
  target_group uuid;
  next_order smallint;
  matched_email_invitation boolean := false;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a Lunch Loop'; end if;
  normalized_code := nullif(upper(regexp_replace(coalesce(raw_code, ''), '[^A-Za-z0-9]', '', 'g')), '');

  update public.group_member_invitations
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
  update public.group_member_share_invitations
  set status = 'expired'
  where status = 'pending' and expires_at <= now();

  select * into email_invitation
  from public.group_member_invitations
  where status = 'pending'
    and expires_at > now()
    and (
      (nullif(trim(coalesce(raw_token, '')), '') <> '' and token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex'))
      or (normalized_code is not null and short_code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex'))
    )
  for update;

  matched_email_invitation := found;
  if matched_email_invitation then
    select lower(email) into account_email from auth.users where id = auth.uid();
    if account_email is null or lower(email_invitation.recipient_email) <> account_email then
      raise exception '%', 'Sign in with the email invited at ' || email_invitation.recipient_email;
    end if;
    target_group := email_invitation.group_id;
  else
    -- A shareable invite has no long token; it is intentionally code-only.
    if normalized_code is null or nullif(trim(coalesce(raw_token, '')), '') is not null then
      raise exception 'That invitation is unavailable, expired, or already used';
    end if;
    select * into share_invitation
    from public.group_member_share_invitations
    where status = 'pending'
      and expires_at > now()
      and short_code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex')
    for update;
    if not found then
      raise exception 'That invitation is unavailable, expired, or already used';
    end if;
    target_group := share_invitation.group_id;
  end if;

  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not available';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-member-limit:' || target_group::text, 0));
  if exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid()) then
    raise exception 'You are already part of this Lunch Loop';
  end if;
  if (select count(*) from public.group_members where group_id = target_group) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;

  perform public.sync_lunch_profile(new_display_name);
  select coalesce(max(rotation_order) + 1, 0) into next_order
  from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, rotation_order)
  values (target_group, auth.uid(), next_order);
  perform public.copy_member_restaurants_to_lunch_loop(target_group, auth.uid());

  if matched_email_invitation then
    update public.group_member_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = email_invitation.id;
  else
    update public.group_member_share_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = share_invitation.id;
  end if;
  update public.profiles set active_group_id = target_group where id = auth.uid();
  return target_group;
end;
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
  if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Sign in with the email invited at ' || invitation.recipient_email; end if;
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

notify pgrst, 'reload schema';
