create or replace function public.is_group_owner(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.group_members
    where group_id = target_group and user_id = auth.uid() and role = 'owner'
  )
$$;

create or replace function public.create_lunch_round(target_group uuid, restaurant_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_session uuid;
  next_suggester uuid;
  member_count integer;
begin
  if not public.is_group_member(target_group) then
    raise exception 'You are not a member of this lunch group';
  end if;
  if coalesce(array_length(restaurant_ids, 1), 0) <> 3
    or (select count(distinct selected.restaurant_id) from unnest(restaurant_ids) as selected(restaurant_id)) <> 3 then
    raise exception 'Choose exactly three different restaurants';
  end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then
    raise exception 'There is already an active lunch decision';
  end if;

  select count(*) into member_count from public.group_members where group_id = target_group;
  select gm.user_id into next_suggester
  from public.group_members gm
  where gm.group_id = target_group
  order by gm.rotation_order
  offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % member_count)
  limit 1;

  if next_suggester <> auth.uid() then
    raise exception 'It is another member’s turn to suggest lunch';
  end if;
  if (select count(*) from public.restaurants where group_id = target_group and id = any(restaurant_ids) and not never_again) <> 3 then
    raise exception 'All choices must be active restaurants in this group';
  end if;

  insert into public.lunch_sessions(group_id, suggester_id)
  values (target_group, next_suggester)
  returning id into new_session;
  insert into public.lunch_session_candidates(session_id, restaurant_id)
  select new_session, selected.restaurant_id from unnest(restaurant_ids) as selected(restaurant_id);
  return new_session;
end;
$$;

create or replace function public.save_lunch_group_roster(
  target_group uuid,
  member_ids uuid[],
  display_names text[]
)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid := auth.uid();
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only the group owner can manage the roster';
  end if;
  if coalesce(array_length(member_ids, 1), 0) = 0
    or array_length(member_ids, 1) <> array_length(display_names, 1)
    or (select count(distinct roster_member.member_id) from unnest(member_ids) as roster_member(member_id)) <> array_length(member_ids, 1)
    or not owner_id = any(member_ids) then
    raise exception 'Keep the owner in the roster and provide one name for every member';
  end if;
  if exists(select 1 from unnest(display_names) as display_name where char_length(trim(display_name)) not between 1 and 50) then
    raise exception 'Each display name must be between 1 and 50 characters';
  end if;
  if (select count(*) from public.group_members where group_id = target_group and user_id = any(member_ids)) <> array_length(member_ids, 1) then
    raise exception 'Roster members must already belong to this group';
  end if;

  update public.profiles profile
  set display_name = trim(roster.display_name)
  from unnest(member_ids, display_names) as roster(member_id, display_name)
  where profile.id = roster.member_id;

  delete from public.group_members
  where group_id = target_group and user_id <> all(member_ids);

  update public.group_members set rotation_order = rotation_order + 1000 where group_id = target_group;
  update public.group_members member
  set rotation_order = roster.position - 1
  from unnest(member_ids) with ordinality as roster(member_id, position)
  where member.group_id = target_group and member.user_id = roster.member_id;
end;
$$;

drop policy if exists "owners remove restaurants" on public.restaurants;
create policy "owners remove restaurants" on public.restaurants
for delete using (public.is_group_owner(group_id));

grant execute on function public.create_lunch_round(uuid, uuid[]) to authenticated;
grant execute on function public.save_lunch_group_roster(uuid, uuid[], text[]) to authenticated;
