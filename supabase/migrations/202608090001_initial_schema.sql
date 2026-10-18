create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  rotation_order smallint not null check (rotation_order >= 0),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (group_id, rotation_order)
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  google_place_id text not null,
  name text not null,
  address text not null,
  phone text,
  hours jsonb not null default '[]'::jsonb,
  rating numeric(2,1) check (rating between 0 and 5),
  cuisine text,
  lat numeric(9,6),
  lng numeric(9,6),
  visit_count integer not null default 0 check (visit_count >= 0),
  last_visited_at timestamptz,
  never_again boolean not null default false,
  never_again_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, google_place_id)
);
create index restaurants_group_available_idx on public.restaurants(group_id, never_again, visit_count);

create table public.lunch_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  suggester_id uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  final_restaurant_id uuid references public.restaurants(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index lunch_sessions_group_started_idx on public.lunch_sessions(group_id, started_at desc);

create table public.lunch_session_candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lunch_sessions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id),
  added_at timestamptz not null default now(),
  unique (session_id, restaurant_id)
);

create table public.vetoes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lunch_sessions(id) on delete cascade,
  candidate_id uuid not null references public.lunch_session_candidates(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  reason text check (char_length(reason) <= 280),
  created_at timestamptz not null default now(),
  unique (session_id, candidate_id, user_id)
);

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid()) $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger restaurants_touch_updated_at before update on public.restaurants for each row execute function public.touch_updated_at();

create or replace function public.create_lunch_group(group_name text, display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_group uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  insert into public.groups(name) values (trim(group_name)) returning id into new_group;
  insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
  return new_group;
end; $$;

create or replace function public.join_lunch_group(group_invite_code text, display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_group uuid; next_order smallint;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select id into target_group from public.groups where invite_code = upper(trim(group_invite_code));
  if target_group is null then raise exception 'That invite code was not found'; end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name)) on conflict (id) do update set display_name = excluded.display_name;
  select coalesce(max(rotation_order) + 1, 0) into next_order from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, rotation_order) values (target_group, auth.uid(), next_order) on conflict (group_id, user_id) do nothing;
  return target_group;
end; $$;

create or replace function public.start_lunch_session(target_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare session_id uuid; next_suggester uuid;
begin
  if not public.is_group_member(target_group) then raise exception 'Not a group member'; end if;
  if exists(select 1 from public.lunch_sessions where group_id = target_group and status = 'active') then raise exception 'There is already an active lunch session'; end if;
  select gm.user_id into next_suggester from public.group_members gm where gm.group_id = target_group order by gm.rotation_order offset ((select count(*) from public.lunch_sessions where group_id = target_group and status = 'completed') % (select count(*) from public.group_members where group_id = target_group)) limit 1;
  insert into public.lunch_sessions(group_id, suggester_id) values (target_group, next_suggester) returning id into session_id;
  return session_id;
end; $$;

create or replace function public.complete_lunch_session(target_session uuid, winning_restaurant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare session_group uuid;
begin
  select group_id into session_group from public.lunch_sessions where id = target_session and status = 'active' for update;
  if session_group is null or not public.is_group_member(session_group) then raise exception 'Session not available'; end if;
  if not exists(select 1 from public.lunch_session_candidates where session_id = target_session and restaurant_id = winning_restaurant) then raise exception 'Winner must be a candidate'; end if;
  update public.lunch_sessions set status = 'completed', final_restaurant_id = winning_restaurant, completed_at = now() where id = target_session;
  update public.restaurants set visit_count = visit_count + 1, last_visited_at = now() where id = winning_restaurant and group_id = session_group;
end; $$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.restaurants enable row level security;
alter table public.lunch_sessions enable row level security;
alter table public.lunch_session_candidates enable row level security;
alter table public.vetoes enable row level security;

create policy "profiles visible to shared group" on public.profiles for select using (id = auth.uid() or exists(select 1 from public.group_members mine join public.group_members theirs on mine.group_id = theirs.group_id where mine.user_id = auth.uid() and theirs.user_id = profiles.id));
create policy "users edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "members view groups" on public.groups for select using (public.is_group_member(id));
create policy "members view members" on public.group_members for select using (public.is_group_member(group_id));
create policy "members view restaurants" on public.restaurants for select using (public.is_group_member(group_id));
create policy "members add restaurants" on public.restaurants for insert with check (public.is_group_member(group_id));
create policy "members edit restaurants" on public.restaurants for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members view sessions" on public.lunch_sessions for select using (public.is_group_member(group_id));
create policy "members view candidates" on public.lunch_session_candidates for select using (exists(select 1 from public.lunch_sessions s where s.id = session_id and public.is_group_member(s.group_id)));
create policy "members add candidates" on public.lunch_session_candidates for insert with check (exists(select 1 from public.lunch_sessions s where s.id = session_id and public.is_group_member(s.group_id)));
create policy "members view vetoes" on public.vetoes for select using (exists(select 1 from public.lunch_sessions s where s.id = session_id and public.is_group_member(s.group_id)));
create policy "members add own vetoes" on public.vetoes for insert with check (user_id = auth.uid() and exists(select 1 from public.lunch_sessions s where s.id = session_id and public.is_group_member(s.group_id)));

grant execute on function public.create_lunch_group(text, text), public.join_lunch_group(text, text), public.start_lunch_session(uuid), public.complete_lunch_session(uuid, uuid) to authenticated;
