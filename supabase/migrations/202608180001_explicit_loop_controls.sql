create or replace function public.create_lunch_round(target_group uuid, restaurant_ids uuid[], lunch_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_session uuid;
  next_suggester uuid;
  member_count integer;
begin
  if not public.is_group_member(target_group) then raise exception 'You are not a member of this lunch group'; end if;
  if lunch_time <= now() then raise exception 'Choose a lunch time in the future'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then raise exception 'There is already an active lunch decision'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'chosen') then raise exception 'Close the current lunch loop before starting another one'; end if;

  select count(*) into member_count from public.group_members where group_id = target_group;
  if coalesce(array_length(restaurant_ids, 1), 0) <> member_count
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> member_count then
    raise exception 'Choose one different restaurant for every group member';
  end if;
  select gm.user_id into next_suggester from public.group_members gm where gm.group_id = target_group order by gm.rotation_order offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % member_count) limit 1;
  if next_suggester <> auth.uid() then raise exception 'It is another member’s turn to suggest lunch'; end if;
  if (select count(*) from public.restaurants where group_id = target_group and id = any(restaurant_ids) and not never_again) <> member_count then raise exception 'All choices must be active restaurants in this group'; end if;

  insert into public.lunch_sessions(group_id, suggester_id, scheduled_for) values (target_group, next_suggester, lunch_time) returning id into new_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id) select new_session, selected.restaurant_id from unnest(restaurant_ids) as selected(restaurant_id);
  return new_session;
end;
$$;

create or replace function public.update_lunch_round_choices(target_session uuid, restaurant_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare session_group uuid; member_count integer;
begin
  select group_id into session_group from public.lunch_sessions where id = target_session and status = 'active' and suggester_id = auth.uid() for update;
  if session_group is null then raise exception 'Only this round’s suggester can edit its choices'; end if;
  if exists(select 1 from public.vetoes where session_id = target_session) then raise exception 'Choices lock after the first veto'; end if;
  select count(*) into member_count from public.group_members where group_id = session_group;
  if coalesce(array_length(restaurant_ids, 1), 0) <> member_count
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> member_count then raise exception 'Choose one different restaurant for every group member'; end if;
  if (select count(*) from public.restaurants where group_id = session_group and id = any(restaurant_ids) and not never_again) <> member_count then raise exception 'Choices must be active restaurants in this group'; end if;
  delete from public.lunch_session_candidates where session_id = target_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id) select target_session, selected.restaurant_id from unnest(restaurant_ids) as selected(restaurant_id);
end;
$$;

create or replace function public.close_lunch_loop(target_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare session_group uuid; winner uuid; lunch_time timestamptz;
begin
  select group_id, final_restaurant_id, scheduled_for into session_group, winner, lunch_time from public.lunch_sessions where id = target_session and status = 'chosen' for update;
  if session_group is null or not public.is_group_member(session_group) then raise exception 'This lunch loop is not available'; end if;
  if lunch_time > now() then raise exception 'This lunch loop can close after its scheduled time'; end if;
  update public.lunch_sessions set status = 'completed', completed_at = now() where id = target_session;
  update public.restaurants set visit_count = visit_count + 1, last_visited_at = now() where id = winner and group_id = session_group;
end;
$$;

grant execute on function public.update_lunch_round_choices(uuid, uuid[]) to authenticated;
grant execute on function public.close_lunch_loop(uuid) to authenticated;
