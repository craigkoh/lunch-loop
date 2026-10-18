-- A group can contain a completed session whose candidate references the
-- winning restaurant. Delete those session records before deleting restaurants
-- so PostgreSQL never sees a dangling candidate during the group cascade.

create or replace function public.global_admin_permanently_delete_lunch_loop(
  target_group uuid,
  confirmation_name text
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
declare group_name text;
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;

  select name into group_name
  from public.groups
  where id = target_group
  for update;
  if group_name is null then
    raise exception 'That Lunch Loop is no longer available';
  end if;
  if trim(coalesce(confirmation_name, '')) <> group_name then
    raise exception 'Type the exact Lunch Loop name to confirm permanent deletion';
  end if;

  -- Members whose active loop is being removed land on another active loop
  -- when possible. The FK nulls any remaining active_group_id values.
  update public.profiles profile
  set active_group_id = (
    select member.group_id
    from public.group_members member
    join public.groups candidate on candidate.id = member.group_id
    where member.user_id = profile.id
      and member.group_id <> target_group
      and candidate.status = 'active'
    order by candidate.created_at desc
    limit 1
  )
  where profile.active_group_id = target_group;

  -- Do this explicitly rather than relying on two independent group cascades:
  -- lunch_session_candidates.restaurant_id can otherwise still reference a
  -- restaurant while PostgreSQL is cascading the group delete.
  delete from public.lunch_sessions where group_id = target_group;
  delete from public.restaurants where group_id = target_group;
  delete from public.groups where id = target_group;
end;
$body$;

revoke all on function public.global_admin_permanently_delete_lunch_loop(uuid, text) from public, anon, authenticated;
grant execute on function public.global_admin_permanently_delete_lunch_loop(uuid, text) to authenticated;

notify pgrst, 'reload schema';
