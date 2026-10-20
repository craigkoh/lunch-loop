begin;

set local session_replication_role = replica;

insert into public.profiles(id, display_name)
values
  ('11111111-1111-1111-1111-111111111111', 'Admin'),
  ('22222222-2222-2222-2222-222222222222', 'Member');
insert into public.site_admins(user_id)
values ('11111111-1111-1111-1111-111111111111');
insert into public.groups(id, name)
values ('33333333-3333-3333-3333-333333333333', 'Test Loop');
insert into public.group_members(group_id, user_id, role, rotation_order)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner', 0),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'member', 1);
insert into public.restaurants(id, group_id, google_place_id, name, address)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'fixture-place', 'Fixture Place', 'Fixture Address');
insert into public.lunch_sessions(id, group_id, suggester_id, status, scheduled_for, final_restaurant_id)
values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'completed', now(), '44444444-4444-4444-4444-444444444444');
insert into public.lunch_session_candidates(id, session_id, restaurant_id)
values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444');
insert into public.vetoes(session_id, candidate_id, user_id)
values ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222');
insert into public.group_member_invitations(group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'fixture@example.com', 'fixture-member-token', 'fixture-member-code', now() + interval '1 day');
insert into public.loop_creation_invitations(invited_by, source_group_id, recipient_email, token_hash, expires_at)
values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'fixture-new-loop@example.com', 'fixture-loop-token', now() + interval '1 day');
-- Fake URL that only satisfies the Discord webhook format check. It is not a live webhook.
insert into public.group_discord_notifications(group_id, webhook_url, enabled_events)
values ('33333333-3333-3333-3333-333333333333', 'https://discord.com/api/webhooks/fixture/not-a-real-webhook', array['decision_made']);
insert into public.places_api_usage_events(action_name, user_id, group_id)
values ('place_search', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

set local session_replication_role = origin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.global_admin_permanently_delete_lunch_loop('33333333-3333-3333-3333-333333333333', 'Test Loop');
select count(*) as remaining_groups from public.groups where id = '33333333-3333-3333-3333-333333333333';

rollback;
