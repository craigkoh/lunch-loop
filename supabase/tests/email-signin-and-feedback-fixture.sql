-- Run after `npx supabase db reset`. Rolls back its own data.
-- Covers magic-link profile names, email-bound invites, and feedback credit.

begin;

do $body$
begin
  -- GoTrue has used both email_confirmed_at and confirmed_at. Insert the
  -- column this database actually has so the fixture matches local and hosted.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'
  ) then
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values
      ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'sam.friend@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'other.person@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    insert into auth.users (
      id, aud, role, email, encrypted_password, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values
      ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'sam.friend@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'other.person@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  end if;
end;
$body$;

select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.sync_lunch_profile(null);
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select public.sync_lunch_profile(null);
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select public.sync_lunch_profile(null);

do $body$
declare
  owner_name text;
  sam_name text;
  sam_avatar text;
  sam_email text;
  sam_provider text;
begin
  select display_name into owner_name from public.profiles where id = 'a1111111-1111-4111-8111-111111111111';
  select profile.display_name, identity.avatar_url, identity.email, identity.provider
  into sam_name, sam_avatar, sam_email, sam_provider
  from public.profiles profile
  join public.user_account_identities identity on identity.user_id = profile.id
  where profile.id = 'a2222222-2222-4222-8222-222222222222';
  if owner_name <> 'owner' then
    raise exception 'Expected a nameless email account to use the mailbox name, got %', owner_name;
  end if;
  if sam_name <> 'sam.friend' or sam_avatar is not null or sam_email <> 'sam.friend@example.com' or sam_provider <> 'email' then
    raise exception 'Expected sam.friend with no photo and an email provider';
  end if;
end;
$body$;

insert into public.groups(id, name)
values ('a4444444-4444-4444-8444-444444444444', 'Email Invite Fixture');
insert into public.group_members(group_id, user_id, role, rotation_order)
values ('a4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111', 'owner', 0);
insert into public.group_member_invitations(
  group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at
)
values (
  'a4444444-4444-4444-8444-444444444444',
  'a1111111-1111-4111-8111-111111111111',
  'sam.friend@example.com',
  encode(extensions.digest('fixture-email-token', 'sha256'), 'hex'),
  encode(extensions.digest('FIXTURECODE1', 'sha256'), 'hex'),
  now() + interval '1 day'
);

do $body$
declare
  joined_group uuid;
  feedback_id uuid;
  stored_opt_in boolean;
  stored_name text;
  stored_notified timestamptz;
  webhook_def text;
begin
  perform set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
  begin
    perform public.redeem_group_member_invitation('fixture-email-token', null, null);
    raise exception 'A different email redeemed an email-bound invitation';
  exception when others then
    if sqlerrm <> 'Sign in with the email invited at sam.friend@example.com' then
      raise;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
  joined_group := public.redeem_group_member_invitation('fixture-email-token', null, null);
  if joined_group <> 'a4444444-4444-4444-8444-444444444444' then
    raise exception 'Expected the invited email account to join';
  end if;

  begin
    perform public.submit_lunch_loop_feedback('bug', 'Credit me', 'This report opts into a public thank-you name.', '/join', '2026.10.22.60', true, '');
    raise exception 'An opted-in credit without a name was accepted';
  exception when others then
    if sqlerrm <> 'Add a credit name between 1 and 60 characters, or leave credit unchecked' then
      raise;
    end if;
  end;

  feedback_id := public.submit_lunch_loop_feedback(
    'bug', 'Picker wraps badly', 'The restaurant name runs off the card on a narrow phone.',
    '/join', '2026.10.22.60', true, 'Sam'
  );
  select credit_opt_in, credit_name, notified_at
  into stored_opt_in, stored_name, stored_notified
  from public.lunch_loop_feedback
  where id = feedback_id;
  if stored_opt_in is not true or stored_name <> 'Sam' then
    raise exception 'Expected the opted-in credit name to be stored';
  end if;
  if stored_notified is not null then
    raise exception 'Expected no alert timestamp when vault secrets are absent';
  end if;

  perform public.update_my_lunch_loop_feedback_credit(feedback_id, false, 'Sam');
  select credit_opt_in, credit_name
  into stored_opt_in, stored_name
  from public.lunch_loop_feedback
  where id = feedback_id;
  if stored_opt_in is not false or stored_name is not null then
    raise exception 'Expected a member to be able to withdraw public credit';
  end if;

  perform vault.create_secret('https://example.com/lunch-loop-feedback', 'lunchloop_feedback_webhook_url', 'fixture');
  perform vault.create_secret('fixture-key', 'lunchloop_feedback_webhook_key', 'fixture');
  feedback_id := public.submit_lunch_loop_feedback(
    'bug', 'Webhook path', 'This checks that a queued alert stamps the note.',
    '/', '2026.10.22.60', true, 'Sam'
  );
  select notified_at into stored_notified from public.lunch_loop_feedback where id = feedback_id;
  if stored_notified is null then
    raise exception 'Expected an alert timestamp after the webhook call was queued';
  end if;
  if (select count(*) from net.http_request_queue) < 1 then
    raise exception 'Expected the feedback alert to be queued';
  end if;

  update public.site_settings set feedback_webhook_enabled = false where singleton;
  feedback_id := public.submit_lunch_loop_feedback(
    'question', 'Alerts off', 'This note should stay quiet while the switch is off.',
    '/', '2026.10.22.60', false, null
  );
  select notified_at into stored_notified from public.lunch_loop_feedback where id = feedback_id;
  if stored_notified is not null then
    raise exception 'Expected no alert timestamp while feedback alerts are disabled';
  end if;
  update public.site_settings set feedback_webhook_enabled = true where singleton;

  if has_function_privilege('authenticated', 'public.notify_lunch_loop_feedback_webhook()', 'EXECUTE') then
    raise exception 'The feedback webhook trigger must not be callable by signed-in clients';
  end if;
  webhook_def := pg_get_functiondef('public.notify_lunch_loop_feedback_webhook()'::regprocedure);
  if position('email' in webhook_def) > 0 then
    raise exception 'The feedback webhook must not reference an email address';
  end if;
  if position('lunchloop_feedback_webhook_url' in webhook_def) = 0
     or position('lunchloop_feedback_webhook_key' in webhook_def) = 0
     or position('Authorization' in webhook_def) = 0 then
    raise exception 'The feedback webhook must read both vault secrets and send a bearer token';
  end if;
end;
$body$;

rollback;
