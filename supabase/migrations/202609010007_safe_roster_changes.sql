begin;

-- Roster changes alter the number of choices and vetoes in a decision. Keep
-- the roster fixed from the first picks until that decision is fully closed.
-- This trigger also makes the six-person cap hold for every insertion path,
-- including direct additions of people known from another Lunch Loop.
create or replace function public.guard_lunch_loop_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-roster:' || new.group_id::text, 0)
  );

  if (select count(*) from public.group_members where group_id = new.group_id) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;
  if exists(
    select 1
    from public.lunch_sessions
    where group_id = new.group_id
      and status in ('active', 'chosen')
  ) then
    raise exception 'Close the current meal decision before adding someone to this Lunch Loop';
  end if;
  return new;
end;
$body$;

drop trigger if exists guard_lunch_loop_member_insert on public.group_members;
create trigger guard_lunch_loop_member_insert
before insert on public.group_members
for each row execute function public.guard_lunch_loop_member_insert();

-- Use the same advisory lock when a picker begins a decision. Either a roster
-- change happens first and the picker sees the new count, or the decision
-- starts first and the roster change is rejected until it closes.
create or replace function public.create_lunch_round(
  target_group uuid,
  restaurant_ids uuid[],
  lunch_time timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  new_session uuid;
  next_suggester uuid;
  member_count integer;
  available_restaurant_count integer;
  target_loop_type text;
  has_any_session boolean;
begin
  if not public.is_group_member(target_group) then
    raise exception 'You are not a member of this Lunch Loop';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-roster:' || target_group::text, 0)
  );
  if lunch_time <= now() then raise exception 'Choose a meal time in the future'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then raise exception 'There is already an active meal decision'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'chosen') then raise exception 'Close the current meal before starting another one'; end if;

  select loop_type into target_loop_type from public.groups where id = target_group;
  if target_loop_type is null then raise exception 'This Lunch Loop is unavailable'; end if;
  select count(*) into member_count from public.group_members where group_id = target_group;
  select count(*) into available_restaurant_count from public.restaurants where group_id = target_group and not never_again;
  if member_count < 2 then raise exception 'Invite at least one more person before starting a Lunch Loop'; end if;
  if available_restaurant_count < member_count then raise exception 'Add one active place for every group member before starting a Lunch Loop'; end if;
  if coalesce(array_length(restaurant_ids, 1), 0) <> member_count
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> member_count then
    raise exception 'Choose one different restaurant for every group member';
  end if;
  if (select count(*) from public.restaurants where group_id = target_group and id = any(restaurant_ids) and not never_again) <> member_count then
    raise exception 'All choices must be active restaurants in this Lunch Loop';
  end if;

  if target_loop_type = 'occasion' then
    select exists(select 1 from public.lunch_sessions where group_id = target_group) into has_any_session;
    if has_any_session then
      next_suggester := auth.uid();
    else
      select member.user_id into next_suggester
      from public.group_members member
      where member.group_id = target_group and member.role = 'owner'
      order by member.joined_at
      limit 1;
    end if;
  else
    select member.user_id into next_suggester
    from public.group_members member
    where member.group_id = target_group
    order by member.rotation_order
    offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % member_count)
    limit 1;
  end if;
  if next_suggester <> auth.uid() then
    raise exception 'It is another member’s turn to make the picks';
  end if;

  insert into public.lunch_sessions(group_id, suggester_id, scheduled_for)
  values (target_group, next_suggester, lunch_time)
  returning id into new_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id)
  select new_session, selected.restaurant_id
  from unnest(restaurant_ids) as selected(restaurant_id);
  return new_session;
end;
$body$;

revoke all on function public.guard_lunch_loop_member_insert() from public, anon, authenticated;
revoke all on function public.create_lunch_round(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.create_lunch_round(uuid, uuid[], timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
