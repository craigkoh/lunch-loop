-- Keep email-bound fallback codes in the same collision-resistant namespace as
-- shareable codes. This does not change their recipient-email requirement.

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
  insert into public.group_member_invitations(group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at)
  values (target_group, auth.uid(), normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), code_hash, expiry)
  returning id into invitation_record;
  return query select invitation_record, raw_token,
    substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4),
    expiry;
end;
$body$;

revoke all on function public.create_group_member_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.create_group_member_invitation(uuid, text) to authenticated;

notify pgrst, 'reload schema';
