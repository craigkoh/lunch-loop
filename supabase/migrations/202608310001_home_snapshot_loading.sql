-- The home screen is the most frequently opened view. Return its scoped data
-- in one authenticated call so a newly restored browser session does not wait
-- on a chain of client-side requests.

create index if not exists lunch_sessions_group_status_scheduled_idx
  on public.lunch_sessions(group_id, status, scheduled_for desc);

create or replace function public.get_lunch_loop_home_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  selected_group record;
  current_session public.lunch_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to use Lunch Loop';
  end if;

  -- Prefer the member's selected active loop, while never returning a
  -- suspended or archived loop if that preference became stale.
  select
    lunch_group.id,
    lunch_group.name,
    member.role,
    lunch_group.time_zone
  into selected_group
  from public.group_members member
  join public.groups lunch_group on lunch_group.id = member.group_id
  join public.profiles profile on profile.id = member.user_id
  where member.user_id = auth.uid()
    and lunch_group.status = 'active'
  order by (profile.active_group_id = lunch_group.id) desc nulls last,
    lunch_group.created_at desc
  limit 1;

  if selected_group.id is null then
    raise exception 'Create or join an active Lunch Loop first';
  end if;

  select session_record.*
  into current_session
  from public.lunch_sessions session_record
  where session_record.group_id = selected_group.id
    and session_record.status in ('active', 'chosen')
  order by session_record.started_at desc
  limit 1;

  return jsonb_build_object(
    'context', jsonb_build_object(
      'groupId', selected_group.id,
      'groupName', selected_group.name,
      'role', selected_group.role,
      'userId', auth.uid(),
      'timeZone', coalesce(selected_group.time_zone, 'America/Chicago')
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', roster_member.user_id,
        'rotation_order', roster_member.rotation_order,
        'role', roster_member.role,
        'display_name', coalesce(profile.display_name, 'Lunch friend')
      ) order by roster_member.rotation_order), '[]'::jsonb)
      from public.group_members roster_member
      left join public.profiles profile on profile.id = roster_member.user_id
      where roster_member.group_id = selected_group.id
    ),
    'restaurants', (
      select coalesce(jsonb_agg(to_jsonb(restaurant) order by restaurant.name), '[]'::jsonb)
      from public.restaurants restaurant
      where restaurant.group_id = selected_group.id
    ),
    'completed_count', (
      select count(*)
      from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id
        and session_record.status = 'completed'
    ),
    'last_lunch', (
      select jsonb_build_object(
        'restaurant_id', session_record.final_restaurant_id,
        'scheduled_for', session_record.scheduled_for
      )
      from public.lunch_sessions session_record
      where session_record.group_id = selected_group.id
        and session_record.status = 'completed'
        and session_record.final_restaurant_id is not null
      order by session_record.scheduled_for desc
      limit 1
    ),
    'current', case when current_session.id is null then null else jsonb_build_object(
      'id', current_session.id,
      'status', current_session.status,
      'scheduled_for', current_session.scheduled_for,
      'final_restaurant_id', current_session.final_restaurant_id,
      'suggester_id', current_session.suggester_id
    ) end,
    'candidates', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'restaurant_id', candidate.restaurant_id
      ) order by candidate.added_at), '[]'::jsonb)
      from public.lunch_session_candidates candidate
      where candidate.session_id = current_session.id
    ) end,
    'vetoes', case when current_session.id is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'candidate_id', veto.candidate_id,
        'user_id', veto.user_id
      ) order by veto.created_at), '[]'::jsonb)
      from public.vetoes veto
      where veto.session_id = current_session.id
    ) end
  );
end;
$body$;

revoke all on function public.get_lunch_loop_home_snapshot() from public, anon, authenticated;
grant execute on function public.get_lunch_loop_home_snapshot() to authenticated;

notify pgrst, 'reload schema';
