-- A deliberate low-friction alternative to an email-bound member invite.
-- The raw code exists only in the owner's creation response; the database
-- stores a SHA-256 hash. A fresh code replaces the prior shareable code for
-- that loop, so a misplaced link can be invalidated simply by generating one.

create table if not exists public.group_member_share_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  short_code_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists group_member_share_invitation_group_idx
  on public.group_member_share_invitations(group_id, status, created_at desc);

alter table public.group_member_share_invitations enable row level security;
revoke all on table public.group_member_share_invitations from public, anon, authenticated;

-- Count both invitation methods when an optional site-wide daily limit is set.
create or replace function public.ensure_lunch_loop_invite_limit(target_group uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  daily_limit integer;
  sent_count integer;
begin
  select member_invite_limit_per_day into daily_limit
  from public.site_settings
  where singleton;
  if daily_limit is null then return; end if;

  select (
    (select count(*) from public.group_member_invitations
      where group_id = target_group and invited_by = auth.uid() and created_at > now() - interval '1 day')
    +
    (select count(*) from public.group_member_share_invitations
      where group_id = target_group and invited_by = auth.uid() and created_at > now() - interval '1 day')
  ) into sent_count;

  if sent_count >= daily_limit then
    raise exception 'This Lunch Loop has reached its configured invitation limit for today';
  end if;
end;
$body$;

create or replace function public.create_group_member_share_invitation(target_group uuid)
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
  character_position integer;
begin
  if auth.uid() is null or not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can create a shareable invite';
  end if;
  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not accepting invitations';
  end if;
  if (select count(*) from public.group_members where group_id = target_group) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;

  perform public.ensure_lunch_loop_invite_limit(target_group);
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-share-invite:' || target_group::text, 0));
  update public.group_member_share_invitations
  set status = 'revoked', revoked_at = now()
  where group_id = target_group and status = 'pending';

  -- Twelve characters from a 32-character, typo-resistant alphabet gives
  -- 60 bits of entropy. gen_random_bytes supplies the random source.
  loop
    raw_code := '';
    for character_position in 1..12 loop
      raw_code := raw_code || substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        (get_byte(gen_random_bytes(1), 0) % 32) + 1,
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
  insert into public.group_member_share_invitations(group_id, invited_by, short_code_hash, expires_at)
  values (target_group, auth.uid(), code_hash, expiry)
  returning id into invitation_record;

  formatted_code := substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4);
  return query select invitation_record, formatted_code, expiry;
end;
$body$;

create or replace function public.get_group_member_share_invitations(target_group uuid)
returns table(id uuid, status text, expires_at timestamptz, created_at timestamptz, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can view its shareable invites';
  end if;
  update public.group_member_share_invitations as invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  return query
  select invitation.id, invitation.status, invitation.expires_at, invitation.created_at, invitation.accepted_at
  from public.group_member_share_invitations as invitation
  where invitation.group_id = target_group
  order by invitation.created_at desc;
end;
$body$;

create or replace function public.revoke_group_member_share_invitation(target_invitation uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  update public.group_member_share_invitations as invitation
  set status = 'revoked', revoked_at = now()
  where invitation.id = target_invitation
    and invitation.status = 'pending'
    and public.is_group_owner(invitation.group_id);
  if not found then
    raise exception 'That pending shareable invite is not available';
  end if;
end;
$body$;

-- Preserve the existing email-invite behavior, then accept a shareable code
-- only when no email-bound token/code matched. This prevents a code from ever
-- bypassing the recipient-email check on an email invitation.
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
      raise exception '%', 'Use the Google account invited at ' || email_invitation.recipient_email;
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

revoke all on function public.create_group_member_share_invitation(uuid) from public, anon, authenticated;
revoke all on function public.get_group_member_share_invitations(uuid) from public, anon, authenticated;
revoke all on function public.revoke_group_member_share_invitation(uuid) from public, anon, authenticated;
revoke all on function public.redeem_group_member_invitation(text, text, text) from public, anon, authenticated;
grant execute on function public.create_group_member_share_invitation(uuid) to authenticated;
grant execute on function public.get_group_member_share_invitations(uuid) to authenticated;
grant execute on function public.revoke_group_member_share_invitation(uuid) to authenticated;
grant execute on function public.redeem_group_member_invitation(text, text, text) to authenticated;

notify pgrst, 'reload schema';
