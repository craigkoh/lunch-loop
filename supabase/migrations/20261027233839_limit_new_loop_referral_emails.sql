-- Limit "Start your own Lunch Loop" referral emails to 4 per person per day.
-- Applied to staging 2026-10-27. Apply to production only after merge, after a backup.

-- 1) Allow the new rate-limit action name.
alter table public.user_action_rate_limits drop constraint if exists user_action_rate_limits_action_name_check;
alter table public.user_action_rate_limits add constraint user_action_rate_limits_action_name_check
  check (action_name = any (array['create_group'::text, 'join_group'::text, 'create_first_lunch_loop'::text, 'create_loop_creation_invitation'::text]));

-- 2) Add the check to the referral function.
create or replace function public.create_loop_creation_invitation(target_group uuid, target_email text)
 returns table(invitation_id uuid, invitation_token text, expires_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
    declare raw_token text; invitation_record uuid; expiry timestamptz; normalized_email text;
    begin
      if auth.uid() is null or not public.is_group_member(target_group) then raise exception 'Join an active Lunch Loop before referring a new one'; end if;
      normalized_email := lower(trim(coalesce(target_email, '')));
      if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address'; end if;
      begin
        perform public.enforce_user_rate_limit('create_loop_creation_invitation', 4, interval '1 day');
      exception when raise_exception then
        raise exception 'You can send up to 4 “Start your own Lunch Loop” invitations a day. Please try again tomorrow.';
      end;
      raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      expiry := now() + interval '14 days';
      insert into public.loop_creation_invitations(invited_by, source_group_id, recipient_email, token_hash, expires_at)
      values (auth.uid(), target_group, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expiry)
      returning id into invitation_record;
      return query select invitation_record, raw_token, expiry;
    end;
    $function$;

revoke all on function public.create_loop_creation_invitation(uuid, text) from public, anon;
grant execute on function public.create_loop_creation_invitation(uuid, text) to authenticated, service_role;
