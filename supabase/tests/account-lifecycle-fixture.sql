-- Run after `npx supabase db reset`. This fixture rolls itself back after it
-- preserves internal lifecycle coverage without leaving deferred lifecycle
-- features callable by signed-in browser clients.
begin;

-- These deferred RPCs remain in the schema for future review, but production
-- members must not be able to call them while their self-service UI is deferred.
do $body$
begin
  if has_function_privilege('authenticated', 'public.delete_my_lunch_account(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_my_account_lifecycle()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.export_my_lunch_account_data()', 'EXECUTE') then
    raise exception 'Deferred account lifecycle RPCs must not be granted to authenticated users';
  end if;
end;
$body$;


set local session_replication_role = replica;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'delete-me@example.com', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Delete Me"}'::jsonb, now(), now());

insert into public.profiles(id, display_name)
values
  ('11111111-1111-1111-1111-111111111111', 'Owner'),
  ('22222222-2222-2222-2222-222222222222', 'Delete Me');
insert into public.user_account_identities(user_id, email, provider)
values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com', 'email'),
  ('22222222-2222-2222-2222-222222222222', 'delete-me@example.com', 'email');
insert into public.groups(id, name)
values
  ('33333333-3333-3333-3333-333333333333', 'Shared Fixture Loop'),
  ('44444444-4444-4444-4444-444444444444', 'Solo Fixture Loop');
insert into public.group_members(group_id, user_id, role, rotation_order)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner', 0),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'member', 1),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'owner', 0);
insert into public.restaurants(id, group_id, google_place_id, name, address, added_by)
values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'account-lifecycle-fixture-place', 'Fixture Place', 'Fixture Address', '22222222-2222-2222-2222-222222222222');
insert into public.lunch_sessions(id, group_id, suggester_id, status, scheduled_for, final_restaurant_id, completed_at)
values ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'completed', now() - interval '1 day', '55555555-5555-5555-5555-555555555555', now() - interval '1 day');
insert into public.lunch_sessions(id, group_id, suggester_id, status, scheduled_for)
values ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'active', now() + interval '1 day');
insert into public.lunch_session_candidates(id, session_id, restaurant_id)
values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555');
insert into public.vetoes(session_id, candidate_id, user_id)
values ('66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222');
insert into public.lunch_loop_feedback(user_id, group_id, kind, title, details, admin_note, reporter_note)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'question', 'Fixture account question', 'This feedback row proves personal feedback is removed with the account.', 'Private staff-only fixture note', 'Public fixture update');

set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $body$
declare account_export jsonb; lifecycle jsonb;
begin
  if public.set_my_lunch_theme_preference('dark') <> 'dark' then
    raise exception 'Expected the caller to be able to save a dark theme preference';
  end if;
  if public.get_my_lunch_theme_preference() <> 'dark' then
    raise exception 'Expected the saved theme preference to be returned only to the caller';
  end if;
  account_export := public.export_my_lunch_account_data();
  lifecycle := public.get_my_account_lifecycle();
  if account_export #>> '{account,identity,email}' <> 'delete-me@example.com' then
    raise exception 'Expected the export to contain only the caller identity';
  end if;
  if account_export #>> '{restaurant_additions,0,id}' <> '55555555-5555-5555-5555-555555555555' then
    raise exception 'Expected the export to include the caller restaurant addition';
  end if;
  if account_export::text like '%Private staff-only fixture note%' then
    raise exception 'A personal export must not expose private feedback admin notes';
  end if;
  if account_export #>> '{feedback,0,reporter_note}' <> 'Public fixture update' then
    raise exception 'Expected the export to include the reporter-visible feedback update';
  end if;
  if lifecycle #>> '{single_member_owned_loops_to_delete,0,group_name}' <> 'Solo Fixture Loop' then
    raise exception 'Expected the lifecycle preview to identify the solo owned loop';
  end if;
  if lifecycle #>> '{active_decision_loops,0,group_name}' <> 'Shared Fixture Loop' then
    raise exception 'Expected the lifecycle preview to identify the active shared decision';
  end if;

  begin
    perform public.delete_my_lunch_account('DELETE ACCOUNT');
    raise exception 'Expected the typed deletion confirmation to be enforced';
  exception when others then
    if position('Type DELETE MY ACCOUNT' in sqlerrm) = 0 then raise; end if;
  end;
end;
$body$;

do $body$
begin
  begin
    perform public.delete_my_lunch_account('DELETE MY ACCOUNT');
    raise exception 'Expected an active shared decision to block deletion';
  exception when others then
    if position('Finish or cancel the active meal decision' in sqlerrm) = 0 then raise; end if;
  end;
end;
$body$;

update public.lunch_sessions
set status = 'cancelled'
where id = '88888888-8888-8888-8888-888888888888';

insert into public.site_admins(user_id)
values ('22222222-2222-2222-2222-222222222222');

do $body$
begin
  begin
    perform public.delete_my_lunch_account('DELETE MY ACCOUNT');
    raise exception 'Expected the only Global Admin to be protected from account deletion';
  exception when others then
    if position('Add another Global Admin' in sqlerrm) = 0 then raise; end if;
  end;
end;
$body$;

insert into public.site_admins(user_id)
values ('11111111-1111-1111-1111-111111111111');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $body$
begin
  begin
    perform public.delete_my_lunch_account('DELETE MY ACCOUNT');
    raise exception 'Expected a sole owner of a shared loop to transfer ownership first';
  exception when others then
    if position('Transfer ownership of Shared Fixture Loop' in sqlerrm) = 0 then raise; end if;
  end;
end;
$body$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.delete_my_lunch_account('DELETE MY ACCOUNT');

do $body$
begin
  if exists(select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222') then raise exception 'Auth user was not deleted'; end if;
  if exists(select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222') then raise exception 'Profile was not deleted'; end if;
  if exists(select 1 from public.groups where id = '44444444-4444-4444-4444-444444444444') then raise exception 'Solo owned loop was not deleted'; end if;
  if not exists(select 1 from public.groups where id = '33333333-3333-3333-3333-333333333333') then raise exception 'Shared loop should remain'; end if;
  if (select count(*) from public.group_members where group_id = '33333333-3333-3333-3333-333333333333') <> 1 then raise exception 'Shared loop membership was not cleaned up'; end if;
  if (select rotation_order from public.group_members where group_id = '33333333-3333-3333-3333-333333333333' and user_id = '11111111-1111-1111-1111-111111111111') <> 0 then raise exception 'Shared loop roster was not compacted'; end if;
  if (select suggester_id from public.lunch_sessions where id = '66666666-6666-6666-6666-666666666666') is not null then raise exception 'Shared pick was not de-identified'; end if;
  if (select user_id from public.vetoes where session_id = '66666666-6666-6666-6666-666666666666') is not null then raise exception 'Shared veto was not de-identified'; end if;
  if (select added_by from public.restaurants where id = '55555555-5555-5555-5555-555555555555') is not null then raise exception 'Shared restaurant attribution was not de-identified'; end if;
  if exists(select 1 from public.lunch_loop_feedback where user_id = '22222222-2222-2222-2222-222222222222') then raise exception 'Personal feedback was not deleted'; end if;
end;
$body$;

rollback;
