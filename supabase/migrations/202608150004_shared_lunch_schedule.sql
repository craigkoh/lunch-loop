create or replace function public.update_lunch_schedule(target_session uuid, lunch_time timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare session_group uuid;
begin
  if lunch_time <= now() then raise exception 'Choose a lunch time in the future'; end if;
  select group_id into session_group
  from public.lunch_sessions
  where id = target_session and status in ('active', 'chosen');
  if session_group is null or not public.is_group_member(session_group) then
    raise exception 'Only group members can change this lunch time';
  end if;
  update public.lunch_sessions set scheduled_for = lunch_time where id = target_session;
end;
$$;

grant execute on function public.update_lunch_schedule(uuid, timestamptz) to authenticated;
