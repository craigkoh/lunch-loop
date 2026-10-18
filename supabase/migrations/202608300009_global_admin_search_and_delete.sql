-- Global Admin needs a scalable, private user lookup and an explicitly
-- confirmed test/operations deletion path. Both operations stay behind a
-- security-definer function that checks the database-assigned admin role.

create or replace function public.search_site_lunch_loop_users(search_term text)
returns table(user_id uuid, display_name text, account_email text)
language plpgsql security definer set search_path = public, pg_catalog as $body$
declare normalized_term text := lower(trim(coalesce(search_term, '')));
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;
  if char_length(normalized_term) < 2 then
    return;
  end if;

  return query
  select profile.id, profile.display_name, identity.email
  from public.profiles profile
  left join public.user_account_identities identity on identity.user_id = profile.id
  where lower(profile.display_name) like '%' || normalized_term || '%'
     or lower(coalesce(identity.email, '')) like '%' || normalized_term || '%'
  order by
    case when lower(profile.display_name) = normalized_term then 0 else 1 end,
    profile.display_name
  limit 20;
end;
$body$;

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

  -- A member whose active loop is being removed should land on another active
  -- loop when possible. The FK then nulls any remaining active_group_id values.
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

  delete from public.groups where id = target_group;
end;
$body$;

revoke all on function public.search_site_lunch_loop_users(text), public.global_admin_permanently_delete_lunch_loop(uuid, text) from public, anon, authenticated;
grant execute on function public.search_site_lunch_loop_users(text), public.global_admin_permanently_delete_lunch_loop(uuid, text) to authenticated;

notify pgrst, 'reload schema';
