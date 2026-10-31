-- UI refresh (build 2026.10.31.73): facts for the dismissible milestone cards.
-- Computed from existing loop data; nothing new is stored except dismissals
-- (lunch_loop_milestone_dismissals). Members only.
create or replace function public.get_my_loop_milestone_facts(target_group uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_catalog'
as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.group_members where group_id = target_group and user_id = auth.uid()
  ) then
    raise exception 'Only members of this Lunch Loop can see its milestones.';
  end if;

  with done as (
    select s.id, coalesce(s.completed_at, s.scheduled_for) as done_at, s.final_restaurant_id,
      row_number() over (order by coalesce(s.completed_at, s.scheduled_for), s.id) as n
    from public.lunch_sessions s
    where s.group_id = target_group and s.status = 'completed'
  ),
  latest as (select * from done order by n desc limit 1)
  select jsonb_build_object(
    'group_created_at', (select created_at from public.groups where id = target_group),
    'completed_count', (select count(*) from done),
    'nth_lunch_at', coalesce((select jsonb_object_agg(n::text, done_at) from done where n in (10, 25, 50, 100)), '{}'::jsonb),
    'latest', (select jsonb_build_object(
        'session_id', l.id, 'at', l.done_at, 'restaurant_id', l.final_restaurant_id,
        'restaurant_name', (select r.name from public.restaurants r where r.id = l.final_restaurant_id),
        'restaurant_wins', (select count(*) from done d where d.final_restaurant_id = l.final_restaurant_id))
      from latest l),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', gm.user_id,
        'name', coalesce(nullif(trim(gm.nickname), ''), nullif(trim(p.display_name), ''), 'Lunch friend'),
        'joined_at', gm.joined_at,
        'first_lunch_session_id', (select d.id from done d where d.done_at >= gm.joined_at order by d.n limit 1)))
      from public.group_members gm left join public.profiles p on p.id = gm.user_id
      where gm.group_id = target_group), '[]'::jsonb),
    'dismissed', coalesce((select jsonb_agg(milestone_key) from public.lunch_loop_milestone_dismissals
      where user_id = auth.uid() and group_id = target_group), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_my_loop_milestone_facts(uuid) from public, anon;
grant execute on function public.get_my_loop_milestone_facts(uuid) to authenticated, service_role;
