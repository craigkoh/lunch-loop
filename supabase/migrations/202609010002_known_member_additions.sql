-- Let an owner add people they already know through another Lunch Loop.
-- This is intentionally narrower than a site-wide directory: an owner can
-- only select a person who shares one of the owner's other active loops.

create table if not exists public.lunch_loop_member_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'member_added' check (kind in ('member_added')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists lunch_loop_member_notifications_unread_idx
  on public.lunch_loop_member_notifications(user_id, read_at, created_at desc);
alter table public.lunch_loop_member_notifications enable row level security;
revoke all on table public.lunch_loop_member_notifications from public, anon, authenticated;

create or replace function public.copy_member_restaurants_to_lunch_loop(
  target_group uuid,
  source_member uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare copied_count integer;
begin
  if auth.uid() is null
    or (auth.uid() <> source_member and not public.is_group_owner(target_group)) then
    raise exception 'Only the member or this Lunch Loop''s owner may copy restaurant additions';
  end if;
  if not exists(select 1 from public.group_members where group_id = target_group and user_id = source_member) then
    raise exception 'Join the destination Lunch Loop before copying places';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lunch-loop-place-copy:' || target_group::text, 0));
  insert into public.restaurants(
    group_id, google_place_id, name, address, phone, hours, rating, cuisine,
    lat, lng, added_by
  )
  select target_group, restaurant.google_place_id, restaurant.name,
    restaurant.address, restaurant.phone, restaurant.hours, restaurant.rating,
    restaurant.cuisine, restaurant.lat, restaurant.lng, source_member
  from public.restaurants restaurant
  where restaurant.added_by = source_member
    and restaurant.group_id <> target_group
    and exists(
      select 1 from public.group_members source_membership
      where source_membership.group_id = restaurant.group_id
        and source_membership.user_id = source_member
    )
  on conflict (group_id, google_place_id) do nothing;
  get diagnostics copied_count = row_count;
  return copied_count;
end;
$body$;

create or replace function public.get_known_lunch_loop_people(target_group uuid)
returns table(
  user_id uuid,
  display_name text,
  google_full_name text,
  account_email text,
  shared_loop_names text[]
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can view known crew members';
  end if;
  return query
  select known_member.user_id,
    profile.display_name,
    identity.google_full_name,
    identity.email,
    array_agg(distinct source_group.name order by source_group.name)
  from public.group_members known_member
  join public.groups source_group on source_group.id = known_member.group_id
  join public.group_members owner_membership
    on owner_membership.group_id = known_member.group_id
    and owner_membership.user_id = auth.uid()
  join public.profiles profile on profile.id = known_member.user_id
  left join public.user_account_identities identity on identity.user_id = known_member.user_id
  where source_group.status = 'active'
    and known_member.group_id <> target_group
    and known_member.user_id <> auth.uid()
    and not exists(
      select 1 from public.group_members destination_member
      where destination_member.group_id = target_group
        and destination_member.user_id = known_member.user_id
    )
  group by known_member.user_id, profile.display_name, identity.google_full_name, identity.email
  order by profile.display_name;
end;
$body$;

create or replace function public.add_known_lunch_loop_member(
  target_group uuid,
  target_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  next_order smallint;
  target_name text;
  target_email text;
  group_name text;
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can add a known member';
  end if;
  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not accepting members';
  end if;
  if target_user = auth.uid() then raise exception 'You are already in this Lunch Loop'; end if;
  if not exists(
    select 1
    from public.group_members known_member
    join public.groups source_group on source_group.id = known_member.group_id
    join public.group_members owner_membership
      on owner_membership.group_id = known_member.group_id
      and owner_membership.user_id = auth.uid()
    where known_member.user_id = target_user
      and source_group.status = 'active'
      and known_member.group_id <> target_group
  ) then
    raise exception 'Choose someone who shares one of your other active Lunch Loops';
  end if;
  if exists(select 1 from public.group_members where group_id = target_group and user_id = target_user) then
    raise exception 'This person is already in this Lunch Loop';
  end if;
  select coalesce(max(rotation_order) + 1, 0) into next_order
  from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, role, rotation_order)
  values (target_group, target_user, 'member', next_order);
  perform public.copy_member_restaurants_to_lunch_loop(target_group, target_user);
  insert into public.lunch_loop_member_notifications(user_id, group_id, created_by)
  values (target_user, target_group, auth.uid());
  select profile.display_name, identity.email, lunch_group.name
  into target_name, target_email, group_name
  from public.profiles profile
  left join public.user_account_identities identity on identity.user_id = profile.id
  join public.groups lunch_group on lunch_group.id = target_group
  where profile.id = target_user;
  return jsonb_build_object(
    'display_name', coalesce(target_name, 'Lunch Loop friend'),
    'account_email', target_email,
    'group_name', group_name
  );
end;
$body$;

create or replace function public.get_my_lunch_loop_member_notifications()
returns table(id uuid, group_id uuid, group_name text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_catalog
as $body$
  select notification.id, notification.group_id, lunch_group.name, notification.created_at
  from public.lunch_loop_member_notifications notification
  join public.groups lunch_group on lunch_group.id = notification.group_id
  join public.group_members member on member.group_id = notification.group_id
    and member.user_id = auth.uid()
  where notification.user_id = auth.uid()
    and notification.read_at is null
  order by notification.created_at desc
$body$;

create or replace function public.dismiss_lunch_loop_member_notification(target_notification uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  update public.lunch_loop_member_notifications
  set read_at = now()
  where id = target_notification and user_id = auth.uid() and read_at is null;
  if not found then raise exception 'That Lunch Loop message is no longer available'; end if;
end;
$body$;

revoke all on function public.copy_member_restaurants_to_lunch_loop(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_known_lunch_loop_people(uuid) from public, anon, authenticated;
revoke all on function public.add_known_lunch_loop_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_my_lunch_loop_member_notifications() from public, anon, authenticated;
revoke all on function public.dismiss_lunch_loop_member_notification(uuid) from public, anon, authenticated;
grant execute on function public.get_known_lunch_loop_people(uuid) to authenticated;
grant execute on function public.add_known_lunch_loop_member(uuid, uuid) to authenticated;
grant execute on function public.get_my_lunch_loop_member_notifications() to authenticated;
grant execute on function public.dismiss_lunch_loop_member_notification(uuid) to authenticated;

notify pgrst, 'reload schema';
