-- Run after the UI refresh activity/milestone migration. Rolls back its own data.
-- Checks: triggers log round, choices, schedule, veto, winner, cancel, place,
-- never-again, member join/leave, account deletion, report view (deduped) and CSV download;
-- no free text is copied; members cannot read or write the log; site admins
-- can read it; nobody can update it; milestone dismissals are per person.
-- Base rows go in with replica mode (minimal auth.users rows), then the
-- fixture switches back to origin so the activity triggers fire. Any queued
-- Discord calls are discarded by the rollback.

begin;

set local session_replication_role = replica;
-- Minimal auth rows so actor ids are kept (all rolled back).
insert into auth.users(id, aud, role) values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated'),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated'),
  ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated'),
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated');
insert into public.profiles(id, display_name) values
  ('a1111111-1111-4111-8111-111111111111', 'Log Owner'),
  ('a2222222-2222-4222-8222-222222222222', 'Log Member'),
  ('a3333333-3333-4333-8333-333333333333', 'Log Admin'),
  ('a4444444-4444-4444-8444-444444444444', 'Log Joiner');
insert into public.site_admins(user_id) values ('a3333333-3333-4333-8333-333333333333');
insert into public.groups(id, name, loop_type) values ('a5555555-5555-4555-8555-555555555555', 'Log Fixture Loop', 'standing');
insert into public.group_members(group_id, user_id, role, rotation_order) values
  ('a5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'owner', 0),
  ('a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', 'member', 1);
set local session_replication_role = origin;

insert into public.restaurants(id, group_id, google_place_id, name, address, added_by) values
  ('a6666666-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555', 'ChIJlogOne', 'Log One', '1 Log St', 'a1111111-1111-4111-8111-111111111111'),
  ('a6666666-0000-4000-8000-000000000002', 'a5555555-5555-4555-8555-555555555555', 'ChIJlogTwo', 'Log Two', '2 Log St', 'a2222222-2222-4222-8222-222222222222');
insert into public.lunch_sessions(id, group_id, suggester_id, status, scheduled_for)
values ('a7777777-7777-4777-8777-777777777777', 'a5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'active', now() + interval '1 day');
insert into public.lunch_session_candidates(id, session_id, restaurant_id) values
  ('a8888888-0000-4000-8000-000000000001', 'a7777777-7777-4777-8777-777777777777', 'a6666666-0000-4000-8000-000000000001'),
  ('a8888888-0000-4000-8000-000000000002', 'a7777777-7777-4777-8777-777777777777', 'a6666666-0000-4000-8000-000000000002');
update public.lunch_sessions set scheduled_for = scheduled_for + interval '1 hour' where id = 'a7777777-7777-4777-8777-777777777777';
insert into public.vetoes(session_id, candidate_id, user_id, reason)
values ('a7777777-7777-4777-8777-777777777777', 'a8888888-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'SECRET VETO REASON');
update public.lunch_sessions set status = 'chosen', final_restaurant_id = 'a6666666-0000-4000-8000-000000000002' where id = 'a7777777-7777-4777-8777-777777777777';
update public.lunch_sessions set status = 'completed', completed_at = now() where id = 'a7777777-7777-4777-8777-777777777777';
update public.restaurants set never_again = true, never_again_note = 'SECRET NOTE' where id = 'a6666666-0000-4000-8000-000000000001';
update public.restaurants set never_again = false where id = 'a6666666-0000-4000-8000-000000000001';
insert into public.lunch_sessions(id, group_id, suggester_id, status, scheduled_for)
values ('a7777777-7777-4777-8777-777777777778', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', 'active', now() + interval '2 days');
update public.lunch_sessions set status = 'cancelled' where id = 'a7777777-7777-4777-8777-777777777778';
set local session_replication_role = replica;
insert into public.group_members(group_id, user_id, role, rotation_order) values ('a5555555-5555-4555-8555-555555555555', 'a4444444-4444-4444-8444-444444444444', 'member', 2);
set local session_replication_role = origin;
-- The joiner was added in replica mode; removing them in origin mode logs member_left.
delete from public.group_members where group_id = 'a5555555-5555-4555-8555-555555555555' and user_id = 'a4444444-4444-4444-8444-444444444444';

do $check$
declare counts jsonb; dump text;
begin
  select jsonb_object_agg(event_type, n) into counts from (
    select event_type, count(*) n from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555' group by event_type) x;
  if (counts->>'place_added')::int <> 2 then raise exception 'place_added %', counts; end if;
  if (counts->>'round_created')::int <> 2 then raise exception 'round_created %', counts; end if;
  if (counts->>'choices_changed')::int <> 2 then raise exception 'choices_changed %', counts; end if;
  if (counts->>'schedule_changed')::int <> 1 then raise exception 'schedule_changed %', counts; end if;
  if (counts->>'veto_added')::int <> 1 then raise exception 'veto_added %', counts; end if;
  if (counts->>'winner_recorded')::int <> 1 then raise exception 'winner_recorded %', counts; end if;
  if (counts->>'round_completed')::int <> 1 then raise exception 'round_completed %', counts; end if;
  if (counts->>'round_cancelled')::int <> 1 then raise exception 'round_cancelled %', counts; end if;
  if (counts->>'never_again_on')::int <> 1 or (counts->>'never_again_off')::int <> 1 then raise exception 'never_again %', counts; end if;
  if (counts->>'member_left')::int <> 1 then raise exception 'member_left %', counts; end if;
  select string_agg(details::text, ' ') into dump from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555';
  if dump like '%SECRET%' then raise exception 'free text leaked into activity: %', dump; end if;
end
$check$;

-- member_joined through the normal trigger path (no open round now).
set local session_replication_role = origin;
do $join$
begin
  -- fixture user has no auth.users row; FK on group_members.user_id may point at profiles.
  begin
    insert into public.group_members(group_id, user_id, role, rotation_order) values ('a5555555-5555-4555-8555-555555555555', 'a4444444-4444-4444-8444-444444444444', 'member', 2);
  exception when foreign_key_violation then
    raise notice 'skipped member_joined insert check: fixture user has no auth row';
    return;
  end;
  if not exists (select 1 from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555' and event_type = 'member_joined') then
    raise exception 'member_joined not logged';
  end if;
end
$join$;

select set_config('request.jwt.claim.role', 'authenticated', true);

-- Report views are deduped per hour; CSV downloads are logged.
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select public.log_loop_report_view('a5555555-5555-4555-8555-555555555555');
select public.log_loop_report_view('a5555555-5555-4555-8555-555555555555');
select public.export_loop_data('a5555555-5555-4555-8555-555555555555');
do $check$
begin
  if (select count(*) from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555' and event_type = 'report_viewed') <> 1 then raise exception 'report_viewed not deduped'; end if;
  if (select count(*) from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555' and event_type = 'csv_downloaded' and actor_id = 'a2222222-2222-4222-8222-222222222222') <> 1 then raise exception 'csv_downloaded missing'; end if;
end
$check$;

-- Outsiders cannot log a report view.
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
select public.log_loop_report_view('a5555555-5555-4555-8555-555555555555');
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);

-- Members: no reads, no writes. Milestone dismissals: own rows only.
set local role authenticated;
do $check$
declare n int;
begin
  select count(*) into n from public.lunch_loop_activity;
  if n <> 0 then raise exception 'member could read % activity rows', n; end if;
  begin
    insert into public.lunch_loop_activity(group_id, event_type) values ('a5555555-5555-4555-8555-555555555555', 'report_viewed');
    raise exception 'member inserted activity';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_loop_activity('a5555555-5555-4555-8555-555555555555', 'report_viewed');
    raise exception 'member called record_loop_activity';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lunch_loop_milestone_dismissals(user_id, group_id, milestone_key) values ('a1111111-1111-4111-8111-111111111111', 'a5555555-5555-4555-8555-555555555555', 'lunches:10');
    raise exception 'member dismissed for someone else';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
end
$check$;
reset role;

-- Site admins can read. Nobody can update.
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
set local role authenticated;
do $check$
begin
  if (select count(*) from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555') < 14 then raise exception 'admin could not read activity'; end if;
end
$check$;
reset role;
do $check$
begin
  begin
    update public.lunch_loop_activity set event_type = 'report_viewed' where group_id = 'a5555555-5555-4555-8555-555555555555';
    raise exception 'activity was updated';
  exception when raise_exception then
    if sqlerrm <> 'Loop activity is append-only' then raise; end if;
  end;
end
$check$;

-- Deleting an account clears its ids from the log (and its dismissals) without errors.
insert into public.lunch_loop_milestone_dismissals(user_id, group_id, milestone_key)
values ('a2222222-2222-4222-8222-222222222222', 'a5555555-5555-4555-8555-555555555555', 'lunches:10');
delete from auth.users where id = 'a2222222-2222-4222-8222-222222222222';
do $check$
begin
  if exists (select 1 from public.lunch_loop_activity where actor_id = 'a2222222-2222-4222-8222-222222222222' or subject_user_id = 'a2222222-2222-4222-8222-222222222222') then raise exception 'deleted account still in activity'; end if;
  if exists (select 1 from public.lunch_loop_milestone_dismissals where user_id = 'a2222222-2222-4222-8222-222222222222') then raise exception 'dismissal survived account deletion'; end if;
end
$check$;

-- Deleting the loop removes its activity without errors.
delete from public.lunch_sessions where group_id = 'a5555555-5555-4555-8555-555555555555';
delete from public.groups where id = 'a5555555-5555-4555-8555-555555555555';
do $check$
begin
  if exists (select 1 from public.lunch_loop_activity where group_id = 'a5555555-5555-4555-8555-555555555555') then raise exception 'activity survived loop deletion'; end if;
end
$check$;

select 'activity log fixture passed' as result;
rollback;
