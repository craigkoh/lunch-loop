alter table public.lunch_sessions
  add column if not exists scheduled_for timestamptz;

update public.lunch_sessions
set scheduled_for = coalesce(completed_at, started_at)
where scheduled_for is null;

alter table public.lunch_sessions
  alter column scheduled_for set not null;

alter table public.lunch_sessions drop constraint if exists lunch_sessions_status_check;
alter table public.lunch_sessions add constraint lunch_sessions_status_check
  check (status in ('active', 'chosen', 'completed', 'cancelled'));

delete from public.vetoes newer
using public.vetoes older
where newer.session_id = older.session_id
  and newer.user_id = older.user_id
  and newer.created_at > older.created_at;

create unique index if not exists vetoes_one_per_member_per_session_idx
  on public.vetoes(session_id, user_id);

create or replace function public.close_due_lunches(target_group uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare completed_count integer;
begin
  if not public.is_group_member(target_group) then raise exception 'You are not a member of this lunch group'; end if;
  with due as (
    update public.lunch_sessions
    set status = 'completed', completed_at = now()
    where group_id = target_group and status = 'chosen' and scheduled_for <= now()
    returning final_restaurant_id
  ), bumped as (
    update public.restaurants restaurant
    set visit_count = visit_count + 1, last_visited_at = now()
    from due
    where restaurant.id = due.final_restaurant_id
    returning restaurant.id
  ) select count(*) into completed_count from bumped;
  return completed_count;
end;
$$;

drop function if exists public.create_lunch_round(uuid, uuid[]);
create function public.create_lunch_round(target_group uuid, restaurant_ids uuid[], lunch_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_session uuid;
  next_suggester uuid;
  member_count integer;
begin
  if not public.is_group_member(target_group) then
    raise exception 'You are not a member of this lunch group';
  end if;
  if lunch_time <= now() then
    raise exception 'Choose a lunch time in the future';
  end if;

  perform public.close_due_lunches(target_group);

  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then
    raise exception 'There is already an active lunch decision';
  end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'chosen') then
    raise exception 'The next round opens after the scheduled lunch time';
  end if;

  select count(*) into member_count from public.group_members where group_id = target_group;
  if coalesce(array_length(restaurant_ids, 1), 0) <> member_count
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> member_count then
    raise exception 'Choose one different restaurant for every group member';
  end if;
  select gm.user_id into next_suggester
  from public.group_members gm
  where gm.group_id = target_group
  order by gm.rotation_order
  offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % member_count)
  limit 1;
  if next_suggester <> auth.uid() then
    raise exception 'It is another member’s turn to suggest lunch';
  end if;
  if (select count(*) from public.restaurants where group_id = target_group and id = any(restaurant_ids) and not never_again) <> member_count then
    raise exception 'All choices must be active restaurants in this group';
  end if;

  insert into public.lunch_sessions(group_id, suggester_id, scheduled_for)
  values (target_group, next_suggester, lunch_time)
  returning id into new_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id)
  select new_session, selected.restaurant_id from unnest(restaurant_ids) as selected(restaurant_id);
  return new_session;
end;
$$;

create or replace function public.update_lunch_schedule(target_session uuid, lunch_time timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if lunch_time <= now() then raise exception 'Choose a lunch time in the future'; end if;
  update public.lunch_sessions
  set scheduled_for = lunch_time
  where id = target_session and status = 'active' and suggester_id = auth.uid();
  if not found then raise exception 'Only this round’s suggester can change its lunch time'; end if;
end;
$$;

create or replace function public.finalize_lunch_session(target_session uuid, winning_restaurant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare session_group uuid;
begin
  select group_id into session_group from public.lunch_sessions where id = target_session and status = 'active' for update;
  if session_group is null or not public.is_group_member(session_group) then raise exception 'Lunch decision is not available'; end if;
  if not exists(select 1 from public.lunch_session_candidates candidate where candidate.session_id = target_session and candidate.restaurant_id = winning_restaurant and not exists(select 1 from public.vetoes veto where veto.candidate_id = candidate.id)) then
    raise exception 'The winner must be the one remaining choice';
  end if;
  update public.lunch_sessions
  set status = 'chosen', final_restaurant_id = winning_restaurant
  where id = target_session;
end;
$$;

grant execute on function public.create_lunch_round(uuid, uuid[], timestamptz) to authenticated;
grant execute on function public.close_due_lunches(uuid) to authenticated;
grant execute on function public.update_lunch_schedule(uuid, timestamptz) to authenticated;
grant execute on function public.finalize_lunch_session(uuid, uuid) to authenticated;
