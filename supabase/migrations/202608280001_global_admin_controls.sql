-- Site-wide administration is granted by user ID, never by a client-side email check.
create table if not exists public.site_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.site_settings (
  singleton boolean primary key default true check (singleton),
  allow_new_groups boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.site_settings (singleton) values (true) on conflict (singleton) do nothing;

alter table public.groups add column if not exists status text not null default 'active';
alter table public.groups drop constraint if exists groups_status_check;
alter table public.groups add constraint groups_status_check check (status in ('active', 'suspended'));
alter table public.groups add column if not exists suspended_reason text;
alter table public.groups add column if not exists suspended_at timestamptz;

alter table public.site_admins enable row level security;
alter table public.site_settings enable row level security;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.site_admins where user_id = auth.uid())
$$;

-- Craig is seeded once, from the existing authenticated account. No email is exposed to the app.
insert into public.site_admins (user_id)
select profile.id
from public.profiles profile
join auth.users account on account.id = profile.id
where lower(account.email) = lower('craigkoh@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_site_admin() or exists(
    select 1
    from public.group_members member
    join public.groups lunch_group on lunch_group.id = member.group_id
    where member.group_id = target_group
      and member.user_id = auth.uid()
      and lunch_group.status = 'active'
  )
$$;

create or replace function public.create_lunch_group(group_name text, display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_group uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not coalesce((select allow_new_groups from public.site_settings where singleton), true) and not public.is_site_admin() then
    raise exception 'New lunch groups are not available right now';
  end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  insert into public.groups(name) values (trim(group_name)) returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  return new_group;
end;
$$;

create or replace function public.join_lunch_group(group_invite_code text, display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_group uuid; next_order smallint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select id into target_group from public.groups where invite_code = upper(trim(group_invite_code)) and status = 'active';
  if target_group is null then raise exception 'That invite code was not found or the lunch group is unavailable'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  select coalesce(max(rotation_order) + 1, 0) into next_order from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, rotation_order) values (target_group, auth.uid(), next_order) on conflict (group_id, user_id) do nothing;
  return target_group;
end;
$$;

drop policy if exists "site admins view their role" on public.site_admins;
create policy "site admins view their role" on public.site_admins for select to authenticated using (user_id = auth.uid());
drop policy if exists "site admins view site settings" on public.site_settings;
create policy "site admins view site settings" on public.site_settings for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins update site settings" on public.site_settings;
create policy "site admins update site settings" on public.site_settings for update to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

drop policy if exists "site admins view groups" on public.groups;
create policy "site admins view groups" on public.groups for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins view profiles" on public.profiles;
create policy "site admins view profiles" on public.profiles for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins view group members" on public.group_members;
create policy "site admins view group members" on public.group_members for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins view restaurants" on public.restaurants;
create policy "site admins view restaurants" on public.restaurants for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins manage restaurants" on public.restaurants;
create policy "site admins manage restaurants" on public.restaurants for update to authenticated using (public.is_site_admin()) with check (public.is_site_admin());
drop policy if exists "site admins remove restaurants" on public.restaurants;
create policy "site admins remove restaurants" on public.restaurants for delete to authenticated using (public.is_site_admin());
drop policy if exists "site admins view sessions" on public.lunch_sessions;
create policy "site admins view sessions" on public.lunch_sessions for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins view candidates" on public.lunch_session_candidates;
create policy "site admins view candidates" on public.lunch_session_candidates for select to authenticated using (public.is_site_admin());
drop policy if exists "site admins view vetoes" on public.vetoes;
create policy "site admins view vetoes" on public.vetoes for select to authenticated using (public.is_site_admin());

create or replace function public.global_admin_update_site_settings(new_allow_new_groups boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  update public.site_settings set allow_new_groups = new_allow_new_groups, updated_at = now(), updated_by = auth.uid() where singleton;
end;
$$;

create or replace function public.global_admin_update_group(
  target_group uuid,
  new_name text,
  new_status text,
  new_suspension_reason text,
  regenerate_invite boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if char_length(trim(new_name)) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters'; end if;
  if new_status not in ('active', 'suspended') then raise exception 'Choose an active or suspended group status'; end if;
  update public.groups
  set name = trim(new_name),
      status = new_status,
      suspended_reason = case when new_status = 'suspended' then nullif(trim(new_suspension_reason), '') else null end,
      suspended_at = case when new_status = 'suspended' then now() else null end,
      invite_code = case when regenerate_invite then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) else invite_code end
  where id = target_group;
  if not found then raise exception 'Lunch group was not found'; end if;
end;
$$;

create or replace function public.global_admin_set_group_owner(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if not exists(select 1 from public.group_members where group_id = target_group and user_id = target_user) then raise exception 'That person is not in this lunch group'; end if;
  update public.group_members set role = 'member' where group_id = target_group;
  update public.group_members set role = 'owner' where group_id = target_group and user_id = target_user;
end;
$$;

create or replace function public.global_admin_remove_group_member(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if (select count(*) from public.group_members where group_id = target_group) <= 1 then raise exception 'A lunch group must keep at least one member'; end if;
  if exists(select 1 from public.group_members where group_id = target_group and user_id = target_user and role = 'owner')
    and (select count(*) from public.group_members where group_id = target_group and role = 'owner') <= 1 then
    raise exception 'Choose another owner before removing the current owner';
  end if;
  delete from public.group_members where group_id = target_group and user_id = target_user;
  if not found then raise exception 'That person is not in this lunch group'; end if;
  update public.group_members set rotation_order = rotation_order + 1000 where group_id = target_group;
  with reordered as (
    select user_id, row_number() over (order by rotation_order) - 1 as next_order
    from public.group_members where group_id = target_group
  )
  update public.group_members member set rotation_order = reordered.next_order
  from reordered where member.group_id = target_group and member.user_id = reordered.user_id;
end;
$$;

create or replace function public.global_admin_cancel_lunch_session(target_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  update public.lunch_sessions set status = 'cancelled' where id = target_session and status in ('active', 'chosen');
  if not found then raise exception 'There is no active lunch loop to cancel'; end if;
end;
$$;

grant execute on function public.is_site_admin(), public.global_admin_update_site_settings(boolean), public.global_admin_update_group(uuid, text, text, text, boolean), public.global_admin_set_group_owner(uuid, uuid), public.global_admin_remove_group_member(uuid, uuid), public.global_admin_cancel_lunch_session(uuid) to authenticated;
