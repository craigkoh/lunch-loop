-- A Lunch Loop may have one shareable code per currently open seat. The
-- optional owner-only label is a private reminder of who each code is for;
-- it is not used to authenticate the person who redeems the code.

alter table public.group_member_share_invitations
  add column if not exists invite_label text;

alter table public.group_member_share_invitations
  drop constraint if exists group_member_share_invitation_label_length;
alter table public.group_member_share_invitations
  add constraint group_member_share_invitation_label_length
  check (invite_label is null or char_length(trim(invite_label)) between 1 and 80);

drop function if exists public.create_group_member_share_invitation(uuid);

create function public.create_group_member_share_invitation(
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
  update public.group_member_share_invitations
  set status = 'expired'
  where group_id = target_group and status = 'pending' and expires_at <= now();

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
  insert into public.group_member_share_invitations(group_id, invited_by, invite_label, short_code_hash, expires_at)
  values (target_group, auth.uid(), normalized_label, code_hash, expiry)
  returning id into invitation_record;

  formatted_code := substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4);
  return query select invitation_record, formatted_code, expiry;
end;
$body$;

drop function if exists public.get_group_member_share_invitations(uuid);

create function public.get_group_member_share_invitations(target_group uuid)
returns table(id uuid, invite_label text, status text, expires_at timestamptz, created_at timestamptz, accepted_at timestamptz)
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
  select invitation.id, invitation.invite_label, invitation.status,
    invitation.expires_at, invitation.created_at, invitation.accepted_at
  from public.group_member_share_invitations as invitation
  where invitation.group_id = target_group
  order by invitation.created_at desc;
end;
$body$;

revoke all on function public.create_group_member_share_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.get_group_member_share_invitations(uuid) from public, anon, authenticated;
grant execute on function public.create_group_member_share_invitation(uuid, text) to authenticated;
grant execute on function public.get_group_member_share_invitations(uuid) to authenticated;

notify pgrst, 'reload schema';
