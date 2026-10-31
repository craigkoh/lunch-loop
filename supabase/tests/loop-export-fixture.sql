-- Run after the loop CSV export migration. Rolls back its own data.
-- Checks: a member gets only Lunch Loop's own data (place refs and place_id,
-- no Google names/addresses, no emails); a non-member and a site admin who is
-- not a member are refused; the 6th download in a day is refused.
-- Replica mode stays on so fixture users need no auth.users rows.

begin;

set local session_replication_role = replica;

insert into public.profiles(id, display_name)
values
  ('e1111111-1111-4111-8111-111111111111', 'Export Owner'),
  ('e2222222-2222-4222-8222-222222222222', 'Export Member'),
  ('e3333333-3333-4333-8333-333333333333', 'Outsider'),
  ('e4444444-4444-4444-8444-444444444444', 'Admin Not Member');
insert into public.site_admins(user_id) values ('e4444444-4444-4444-8444-444444444444');

insert into public.groups(id, name, loop_type)
values ('e5555555-5555-4555-8555-555555555555', 'Export Fixture Loop', 'standing');
insert into public.group_members(group_id, user_id, role, rotation_order, nickname)
values
  ('e5555555-5555-4555-8555-555555555555', 'e1111111-1111-4111-8111-111111111111', 'owner', 0, null),
  ('e5555555-5555-4555-8555-555555555555', 'e2222222-2222-4222-8222-222222222222', 'member', 1, '=Nick');

insert into public.restaurants(id, group_id, google_place_id, name, address, phone, rating, visit_count, last_visited_at, added_by, created_at)
values
  ('e6666666-0000-4000-8000-000000000001', 'e5555555-5555-4555-8555-555555555555', 'ChIJfixtureOne', 'Secret Google Name One', '1 Google Address', '555-0101', 4.5, 0, null, 'e1111111-1111-4111-8111-111111111111', now() - interval '3 days'),
  ('e6666666-0000-4000-8000-000000000002', 'e5555555-5555-4555-8555-555555555555', 'ChIJfixtureTwo', 'Secret Google Name Two', '2 Google Address', '555-0102', 4.1, 1, now() - interval '1 day', 'e2222222-2222-4222-8222-222222222222', now() - interval '2 days'),
  ('e6666666-0000-4000-8000-000000000003', 'e5555555-5555-4555-8555-555555555555', 'ChIJfixtureThree', 'Secret Google Name Three', '3 Google Address', null, null, 0, null, null, now() - interval '1 days');

insert into public.lunch_sessions(id, group_id, suggester_id, status, final_restaurant_id, started_at, completed_at, scheduled_for)
values ('e7777777-7777-4777-8777-777777777777', 'e5555555-5555-4555-8555-555555555555', 'e1111111-1111-4111-8111-111111111111', 'completed', 'e6666666-0000-4000-8000-000000000002', now() - interval '1 day', now() - interval '20 hours', now() - interval '1 day');
insert into public.lunch_session_candidates(id, session_id, restaurant_id)
values
  ('e8888888-0000-4000-8000-000000000001', 'e7777777-7777-4777-8777-777777777777', 'e6666666-0000-4000-8000-000000000001'),
  ('e8888888-0000-4000-8000-000000000002', 'e7777777-7777-4777-8777-777777777777', 'e6666666-0000-4000-8000-000000000002');
insert into public.vetoes(session_id, candidate_id, user_id)
values ('e7777777-7777-4777-8777-777777777777', 'e8888888-0000-4000-8000-000000000001', 'e2222222-2222-4222-8222-222222222222');

select set_config('request.jwt.claim.role', 'authenticated', true);

-- A member gets the loop's own data.
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
do $check$
declare data jsonb; lunch jsonb; text_dump text;
begin
  data := public.export_loop_data('e5555555-5555-4555-8555-555555555555');
  text_dump := data::text;
  if jsonb_array_length(data->'lunches') <> 1 then raise exception 'expected 1 lunch, got %', data->'lunches'; end if;
  if jsonb_array_length(data->'places') <> 3 then raise exception 'expected 3 places'; end if;
  lunch := data->'lunches'->0;
  if lunch->>'winner_ref' <> 'P2' or lunch->>'winner_google_place_id' <> 'ChIJfixtureTwo' then raise exception 'wrong winner %', lunch; end if;
  if lunch->>'vetoed_refs' <> 'P1' or (lunch->>'veto_count')::int <> 1 or (lunch->>'places_in_running')::int <> 2 then raise exception 'wrong vetoes %', lunch; end if;
  if lunch->>'suggester' <> 'Export Owner' then raise exception 'wrong suggester %', lunch; end if;
  if data->'places'->1->>'added_by' <> '=Nick' or (data->'places'->1->>'wins')::int <> 1 then raise exception 'wrong place row %', data->'places'->1; end if;
  if text_dump like '%Secret Google Name%' or text_dump like '%Google Address%' or text_dump like '%555-01%' or text_dump like '%"rating"%' or text_dump like '%"name"%' then
    raise exception 'export leaked Google place details: %', text_dump;
  end if;
  if text_dump like '%@%' then raise exception 'export contains an @ (possible email): %', text_dump; end if;
end;
$check$;

-- An outsider is refused.
select set_config('request.jwt.claim.sub', 'e3333333-3333-4333-8333-333333333333', true);
do $check$
begin
  begin
    perform public.export_loop_data('e5555555-5555-4555-8555-555555555555');
    raise exception 'an outsider could export';
  exception when others then
    if sqlerrm <> 'Only members of this Lunch Loop can download its data.' then raise; end if;
  end;
end;
$check$;

-- A site admin who is not a member is refused too.
select set_config('request.jwt.claim.sub', 'e4444444-4444-4444-8444-444444444444', true);
do $check$
begin
  begin
    perform public.export_loop_data('e5555555-5555-4555-8555-555555555555');
    raise exception 'a non-member site admin could export';
  exception when others then
    if sqlerrm <> 'Only members of this Lunch Loop can download its data.' then raise; end if;
  end;
end;
$check$;

-- Daily limit: 4 more succeed for the member (5 total), the 6th is refused.
select set_config('request.jwt.claim.sub', 'e2222222-2222-4222-8222-222222222222', true);
do $check$
begin
  for i in 1..4 loop
    perform public.export_loop_data('e5555555-5555-4555-8555-555555555555');
  end loop;
  begin
    perform public.export_loop_data('e5555555-5555-4555-8555-555555555555');
    raise exception 'the 6th download was allowed';
  exception when others then
    if sqlerrm <> 'You can download loop data up to 5 times a day. Please try again tomorrow.' then raise; end if;
  end;
end;
$check$;

-- Signed-out callers are refused.
select set_config('request.jwt.claim.sub', '', true);
do $check$
begin
  begin
    perform public.export_loop_data('e5555555-5555-4555-8555-555555555555');
    raise exception 'a signed-out caller could export';
  exception when others then
    if sqlerrm <> 'Sign in to download your loop data.' then raise; end if;
  end;
end;
$check$;

select 'loop-export-fixture passed' as result;

rollback;
