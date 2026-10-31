-- Run after the milestone facts migration. Rolls back its own data.
-- Checks: lunch count and 10th-lunch date, latest winner's win count, a late
-- joiner's first lunch, own dismissals only, and outsiders are refused.
begin;
set local session_replication_role = replica;
insert into public.profiles(id, display_name) values
  ('c1111111-1111-4111-8111-111111111111', 'Facts Owner'),
  ('c2222222-2222-4222-8222-222222222222', 'Late Joiner'),
  ('c3333333-3333-4333-8333-333333333333', 'Outsider');
insert into public.groups(id, name, loop_type, created_at) values ('c5555555-5555-4555-8555-555555555555', 'Facts Loop', 'standing', now() - interval '1 year 2 days');
insert into public.group_members(group_id, user_id, role, rotation_order, joined_at) values
  ('c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'owner', 0, now() - interval '1 year 2 days'),
  ('c5555555-5555-4555-8555-555555555555', 'c2222222-2222-4222-8222-222222222222', 'member', 1, now() - interval '3 days');
insert into public.restaurants(id, group_id, google_place_id, name, address) values
  ('c6666666-0000-4000-8000-000000000001', 'c5555555-5555-4555-8555-555555555555', 'ChIJfactsOne', 'Old Favorite', '1 St'),
  ('c6666666-0000-4000-8000-000000000002', 'c5555555-5555-4555-8555-555555555555', 'ChIJfactsTwo', 'New Winner', '2 St');
insert into public.lunch_sessions(group_id, suggester_id, status, final_restaurant_id, scheduled_for, completed_at)
select 'c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'completed',
  case when g = 10 then 'c6666666-0000-4000-8000-000000000002'::uuid else 'c6666666-0000-4000-8000-000000000001'::uuid end,
  now() - ((11 - g) * interval '7 days') + interval '6 days 12 hours', now() - ((11 - g) * interval '7 days') + interval '6 days 13 hours'
from generate_series(1, 10) g;
insert into public.lunch_loop_milestone_dismissals(user_id, group_id, milestone_key) values
  ('c1111111-1111-4111-8111-111111111111', 'c5555555-5555-4555-8555-555555555555', 'anniversary:1'),
  ('c2222222-2222-4222-8222-222222222222', 'c5555555-5555-4555-8555-555555555555', 'lunches:10');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);
do $check$
declare facts jsonb; joiner jsonb;
begin
  facts := public.get_my_loop_milestone_facts('c5555555-5555-4555-8555-555555555555');
  if (facts->>'completed_count')::int <> 10 then raise exception 'count %', facts; end if;
  if facts->'nth_lunch_at'->>'10' is null then raise exception 'missing 10th lunch date %', facts; end if;
  if facts->'latest'->>'restaurant_name' <> 'New Winner' or (facts->'latest'->>'restaurant_wins')::int <> 1 then raise exception 'latest %', facts->'latest'; end if;
  select m into joiner from jsonb_array_elements(facts->'members') m where m->>'user_id' = 'c2222222-2222-4222-8222-222222222222';
  if joiner->>'first_lunch_session_id' <> facts->'latest'->>'session_id' then raise exception 'joiner first lunch %', joiner; end if;
  if facts->'dismissed' <> '["anniversary:1"]'::jsonb then raise exception 'dismissed should be own only: %', facts->'dismissed'; end if;
end
$check$;
select set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', true);
do $check$
begin
  perform public.get_my_loop_milestone_facts('c5555555-5555-4555-8555-555555555555');
  raise exception 'outsider read milestone facts';
exception when raise_exception then
  if sqlerrm = 'outsider read milestone facts' then raise; end if;
end
$check$;
select 'milestone facts fixture passed' as result;
rollback;
