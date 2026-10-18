-- Run after the local schema migrations. This leaves the local database
-- unchanged and covers the two Occasion-specific invariants: clean copied
-- place details and manual picker ownership after the first completed night.

begin;

set local session_replication_role = replica;

insert into public.profiles(id, display_name)
values
  ('11111111-1111-1111-1111-111111111111', 'Occasion Owner'),
  ('22222222-2222-2222-2222-222222222222', 'Second Joiner');

insert into public.groups(id, name, loop_type)
values
  ('33333333-3333-3333-3333-333333333333', 'Owner Source', 'standing'),
  ('44444444-4444-4444-4444-444444444444', 'Second Source', 'standing'),
  ('55555555-5555-5555-5555-555555555555', 'Fixture Occasion', 'occasion'),
  ('66666666-6666-6666-6666-666666666666', 'Fixture Standing', 'standing');

insert into public.group_members(group_id, user_id, role, rotation_order, joined_at)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner', 0, now() - interval '4 days'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'owner', 0, now() - interval '4 days'),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'owner', 0, now() - interval '3 days'),
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'member', 1, now() - interval '2 days'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'owner', 0, now() - interval '3 days'),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'member', 1, now() - interval '2 days');

insert into public.restaurants(group_id, google_place_id, name, address, visit_count, last_visited_at, never_again, added_by)
values
  ('33333333-3333-3333-3333-333333333333', 'fixture-shared-place', 'Shared Fixture', 'Source Address', 9, now(), true, '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444', 'fixture-shared-place', 'Shared Fixture', 'Second Source Address', 4, now(), true, '22222222-2222-2222-2222-222222222222'),
  ('55555555-5555-5555-5555-555555555555', 'fixture-occasion-second', 'Occasion Second', 'Occasion Address', 0, null, false, '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'fixture-standing-one', 'Standing One', 'Standing Address', 0, null, false, '11111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'fixture-standing-two', 'Standing Two', 'Standing Address', 0, null, false, '22222222-2222-2222-2222-222222222222');

set local session_replication_role = origin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.copy_member_restaurants_to_lunch_loop('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.copy_member_restaurants_to_lunch_loop('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222');

do $body$
declare copied public.restaurants%rowtype; copied_total integer;
begin
  select * into copied
  from public.restaurants
  where group_id = '55555555-5555-5555-5555-555555555555'
    and google_place_id = 'fixture-shared-place';
  select count(*) into copied_total
  from public.restaurants
  where group_id = '55555555-5555-5555-5555-555555555555'
    and google_place_id = 'fixture-shared-place';
  if copied.id is null
    or copied_total <> 1
    or copied.added_by <> '11111111-1111-1111-1111-111111111111'
    or copied.visit_count <> 0
    or copied.last_visited_at is not null
    or copied.never_again then
    raise exception 'Occasion copy did not keep the first joiner and reset loop activity';
  end if;
end;
$body$;

-- The first Occasion session is owned by its owner.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.create_lunch_round(
  '55555555-5555-5555-5555-555555555555',
  array[
    (select id from public.restaurants where group_id = '55555555-5555-5555-5555-555555555555' and google_place_id = 'fixture-shared-place'),
    (select id from public.restaurants where group_id = '55555555-5555-5555-5555-555555555555' and google_place_id = 'fixture-occasion-second')
  ],
  now() + interval '2 days'
);

do $body$
begin
  if not exists(
    select 1 from public.lunch_sessions
    where group_id = '55555555-5555-5555-5555-555555555555'
      and suggester_id = '11111111-1111-1111-1111-111111111111'
      and status = 'active'
  ) then
    raise exception 'The Occasion owner was not the first picker';
  end if;
end;
$body$;

update public.lunch_sessions
set status = 'completed', completed_at = now()
where group_id = '55555555-5555-5555-5555-555555555555'
  and status = 'active';

-- After an Occasion completes, the member who starts the next night is picker.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.create_lunch_round(
  '55555555-5555-5555-5555-555555555555',
  array[
    (select id from public.restaurants where group_id = '55555555-5555-5555-5555-555555555555' and google_place_id = 'fixture-shared-place'),
    (select id from public.restaurants where group_id = '55555555-5555-5555-5555-555555555555' and google_place_id = 'fixture-occasion-second')
  ],
  now() + interval '3 days'
);

do $body$
begin
  if not exists(
    select 1 from public.lunch_sessions
    where group_id = '55555555-5555-5555-5555-555555555555'
      and suggester_id = '22222222-2222-2222-2222-222222222222'
      and status = 'active'
  ) then
    raise exception 'The person starting the next Occasion was not the picker';
  end if;
end;
$body$;

rollback;
