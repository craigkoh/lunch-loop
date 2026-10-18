-- Security review follow-up: close the OAuth return-path escape hatch,
-- repair invitation generation, and narrow direct database-table mutation.

-- The first-loop flow has its own rate-limit bucket. Keep the schema check in
-- sync so enabling self-service loop creation cannot fail at the limiter.
alter table public.user_action_rate_limits
  drop constraint if exists user_action_rate_limits_action_name_check;
alter table public.user_action_rate_limits
  add constraint user_action_rate_limits_action_name_check
  check (action_name in ('create_group', 'join_group', 'create_first_lunch_loop'));

-- Email invitations use the extension schema explicitly. The extensions
-- schema is deliberately not on the SECURITY DEFINER search path.
create or replace function public.create_group_member_invitation(target_group uuid, target_email text)
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
  character_position integer;
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
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-share-invite:' || target_group::text, 0));

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
  insert into public.group_member_invitations(group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at)
  values (target_group, auth.uid(), normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), code_hash, expiry)
  returning id into invitation_record;
  return query select invitation_record, raw_token,
    substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4),
    expiry;
end;
$body$;

-- Shareable invite codes use the same entropy source. Qualifying the column
-- avoids conflict with the function's `expires_at` output column.
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
  character_position integer;
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
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-share-invite:' || target_group::text, 0));
  update public.group_member_share_invitations as invitation
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
  if (select count(*) from public.group_member_share_invitations
      where group_id = target_group and status = 'pending') >= open_seats then
    raise exception 'You already have a shareable invite for every open crew spot';
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
  insert into public.group_member_share_invitations(group_id, invited_by, invite_label, short_code_hash, expires_at)
  values (target_group, auth.uid(), normalized_label, code_hash, expiry)
  returning id into invitation_record;

  formatted_code := substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4);
  return query select invitation_record, formatted_code, expiry;
end;
$body$;

-- The browser only needs direct restaurant edits; all other writes flow through
-- authorization-checking RPCs. TRUNCATE bypasses row-level security entirely.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant update, delete on table public.restaurants to authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from authenticated;

-- This trigger does not need any application-schema lookup. A fixed safe path
-- removes the database advisor warning and prevents role-configured paths.
alter function public.touch_updated_at() set search_path = pg_catalog;

notify pgrst, 'reload schema';
