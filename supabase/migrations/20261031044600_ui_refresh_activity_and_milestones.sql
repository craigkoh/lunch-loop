-- UI refresh (build 2026.10.31.73): activity log and milestone dismissals.
--
-- 1. lunch_loop_activity: append-only log of loop interactions for future
--    reporting. Hidden: only site admins can read it. Clients cannot insert,
--    update, or delete. Rows are written by triggers and security-definer
--    functions. No free text (veto reasons, notes) is copied in.
--    Rows go away with their loop (on delete cascade); the actor becomes null
--    when an account is deleted.
-- 2. lunch_loop_milestone_dismissals: which milestone cards a person closed.
--    Each person reads and writes only their own rows.
-- Apply to staging first. Apply to production only after merge, after a backup.

create table if not exists public.lunch_loop_activity (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'round_created', 'choices_changed', 'schedule_changed', 'veto_added',
    'winner_recorded', 'round_cancelled', 'round_completed', 'place_added',
    'never_again_on', 'never_again_off', 'member_joined', 'member_left',
    'report_viewed', 'csv_downloaded'
  )),
  session_id uuid,
  restaurant_id uuid,
  subject_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists lunch_loop_activity_group_time_idx on public.lunch_loop_activity (group_id, occurred_at desc);
create index if not exists lunch_loop_activity_type_time_idx on public.lunch_loop_activity (event_type, occurred_at desc);
create index if not exists lunch_loop_activity_actor_idx on public.lunch_loop_activity (actor_id);

alter table public.lunch_loop_activity enable row level security;
revoke all on table public.lunch_loop_activity from public, anon, authenticated;
grant select on table public.lunch_loop_activity to authenticated;
grant all on table public.lunch_loop_activity to service_role;
drop policy if exists "site admins read loop activity" on public.lunch_loop_activity;
create policy "site admins read loop activity" on public.lunch_loop_activity
  for select to authenticated using (public.is_site_admin());

create or replace function public.prevent_loop_activity_update()
 returns trigger language plpgsql set search_path to 'public', 'pg_catalog'
as $$ begin raise exception 'Loop activity is append-only'; end; $$;
drop trigger if exists lunch_loop_activity_append_only on public.lunch_loop_activity;
create trigger lunch_loop_activity_append_only before update on public.lunch_loop_activity
  for each row execute function public.prevent_loop_activity_update();

-- Internal writer. Never fails the caller's action: logging problems are swallowed.
create or replace function public.record_loop_activity(
  target_group uuid, event text, target_session uuid default null,
  target_restaurant uuid default null, target_subject uuid default null,
  extra jsonb default '{}'::jsonb)
 returns void language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
begin
  if target_group is null or not exists (select 1 from public.groups where id = target_group) then return; end if;
  insert into public.lunch_loop_activity (group_id, actor_id, event_type, session_id, restaurant_id, subject_user_id, details)
  values (target_group,
    case when exists (select 1 from auth.users where id = auth.uid()) then auth.uid() end,
    event, target_session, target_restaurant,
    case when exists (select 1 from auth.users where id = target_subject) then target_subject end,
    coalesce(extra, '{}'::jsonb));
exception when others then
  return;
end;
$$;
revoke all on function public.record_loop_activity(uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_loop_activity(uuid, text, uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.log_lunch_session_activity()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_loop_activity(new.group_id, 'round_created', new.id, null, new.suggester_id,
      jsonb_build_object('scheduled_for', new.scheduled_for));
    return new;
  end if;
  if new.scheduled_for is distinct from old.scheduled_for then
    perform public.record_loop_activity(new.group_id, 'schedule_changed', new.id, null, null,
      jsonb_build_object('from', old.scheduled_for, 'to', new.scheduled_for));
  end if;
  if new.final_restaurant_id is distinct from old.final_restaurant_id and new.final_restaurant_id is not null then
    perform public.record_loop_activity(new.group_id, 'winner_recorded', new.id, new.final_restaurant_id);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      perform public.record_loop_activity(new.group_id, 'round_cancelled', new.id);
    elsif new.status = 'completed' then
      perform public.record_loop_activity(new.group_id, 'round_completed', new.id, new.final_restaurant_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lunch_sessions_activity on public.lunch_sessions;
create trigger lunch_sessions_activity after insert or update on public.lunch_sessions
  for each row execute function public.log_lunch_session_activity();

-- Choices: one row per statement-level change would be ideal; per-row is simple
-- and still small (a round has at most six places).
create or replace function public.log_candidate_activity()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
declare target_session uuid := coalesce(new.session_id, old.session_id);
        target_group uuid;
begin
  select group_id into target_group from public.lunch_sessions where id = target_session;
  perform public.record_loop_activity(target_group, 'choices_changed', target_session,
    coalesce(new.restaurant_id, old.restaurant_id), null,
    jsonb_build_object('change', case when tg_op = 'INSERT' then 'added' else 'removed' end));
  return coalesce(new, old);
end;
$$;
drop trigger if exists lunch_session_candidates_activity on public.lunch_session_candidates;
create trigger lunch_session_candidates_activity after insert or delete on public.lunch_session_candidates
  for each row execute function public.log_candidate_activity();

create or replace function public.log_veto_activity()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
declare target_group uuid; target_restaurant uuid;
begin
  select s.group_id, c.restaurant_id into target_group, target_restaurant
  from public.lunch_session_candidates c join public.lunch_sessions s on s.id = c.session_id
  where c.id = new.candidate_id;
  perform public.record_loop_activity(target_group, 'veto_added', new.session_id, target_restaurant, new.user_id);
  return new;
end;
$$;
drop trigger if exists vetoes_activity on public.vetoes;
create trigger vetoes_activity after insert on public.vetoes
  for each row execute function public.log_veto_activity();

create or replace function public.log_restaurant_activity()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_loop_activity(new.group_id, 'place_added', null, new.id, new.added_by);
  elsif new.never_again is distinct from old.never_again then
    perform public.record_loop_activity(new.group_id,
      case when new.never_again then 'never_again_on' else 'never_again_off' end, null, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists restaurants_activity on public.restaurants;
create trigger restaurants_activity after insert or update of never_again on public.restaurants
  for each row execute function public.log_restaurant_activity();

create or replace function public.log_member_activity()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_loop_activity(new.group_id, 'member_joined', null, null, new.user_id,
      jsonb_build_object('role', new.role));
    return new;
  end if;
  perform public.record_loop_activity(old.group_id, 'member_left', null, null, old.user_id);
  return old;
end;
$$;
drop trigger if exists group_members_activity on public.group_members;
create trigger group_members_activity after insert or delete on public.group_members
  for each row execute function public.log_member_activity();

-- Report views: members only, at most one row per person per loop per hour.
create or replace function public.log_loop_report_view(target_group uuid)
 returns void language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.group_members where group_id = target_group and user_id = auth.uid()) then return; end if;
  if exists (select 1 from public.lunch_loop_activity where group_id = target_group and actor_id = auth.uid()
             and event_type = 'report_viewed' and occurred_at > now() - interval '1 hour') then return; end if;
  perform public.record_loop_activity(target_group, 'report_viewed');
end;
$$;
revoke all on function public.log_loop_report_view(uuid) from public, anon;
grant execute on function public.log_loop_report_view(uuid) to authenticated, service_role;

-- CSV downloads: same export as build .72, plus one activity row per download.
create or replace function public.export_loop_data(target_group uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
    declare result jsonb;
    begin
      if auth.uid() is null then raise exception 'Sign in to download your loop data.'; end if;
      if not exists (
        select 1 from public.group_members member
        join public.groups lunch_group on lunch_group.id = member.group_id
        where member.group_id = target_group and member.user_id = auth.uid() and lunch_group.status = 'active'
      ) then
        raise exception 'Only members of this Lunch Loop can download its data.';
      end if;
      begin
        perform public.enforce_user_rate_limit('export_loop_csv', 5, interval '1 day');
      exception when raise_exception then
        raise exception 'You can download loop data up to 5 times a day. Please try again tomorrow.';
      end;

      with names as (
        select p.id as user_id, coalesce(nullif(trim(gm.nickname), ''), nullif(trim(p.display_name), ''), 'Lunch friend') as display_name
        from public.profiles p
        left join public.group_members gm on gm.group_id = target_group and gm.user_id = p.id
      ),
      place_refs as (
        select r.id, r.google_place_id, r.visit_count, r.last_visited_at, r.never_again, r.added_by, r.created_at,
          row_number() over (order by r.created_at, r.id) as num
        from public.restaurants r where r.group_id = target_group
      ),
      decided as (
        select s.id, s.scheduled_for, s.completed_at, s.status, s.suggester_id, s.final_restaurant_id
        from public.lunch_sessions s
        where s.group_id = target_group and s.final_restaurant_id is not null and s.status in ('chosen', 'completed')
      )
      select jsonb_build_object(
        'loop_name', (select g.name from public.groups g where g.id = target_group),
        'time_zone', (select coalesce(g.time_zone, 'America/Chicago') from public.groups g where g.id = target_group),
        'lunches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'scheduled_for', d.scheduled_for,
            'completed_at', d.completed_at,
            'status', d.status,
            'suggester', coalesce((select n.display_name from names n where n.user_id = d.suggester_id), 'Former member'),
            'winner_ref', 'P' || winner.num,
            'winner_google_place_id', winner.google_place_id,
            'places_in_running', (select count(*) from public.lunch_session_candidates c where c.session_id = d.id),
            'veto_count', (select count(*) from public.vetoes v join public.lunch_session_candidates c on c.id = v.candidate_id where c.session_id = d.id),
            'vetoed_refs', (select string_agg('P' || pr.num, ' ' order by pr.num) from public.vetoes v
               join public.lunch_session_candidates c on c.id = v.candidate_id
               join place_refs pr on pr.id = c.restaurant_id
               where c.session_id = d.id)
          ) order by d.scheduled_for, d.id)
          from decided d left join place_refs winner on winner.id = d.final_restaurant_id
        ), '[]'::jsonb),
        'places', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ref', 'P' || pr.num,
            'google_place_id', pr.google_place_id,
            'wins', pr.visit_count,
            'last_won_at', pr.last_visited_at,
            'vetoes', (select count(*) from public.vetoes v join public.lunch_session_candidates c on c.id = v.candidate_id where c.restaurant_id = pr.id),
            'never_again', pr.never_again,
            'added_by', (select n.display_name from names n where n.user_id = pr.added_by),
            'added_at', pr.created_at
          ) order by pr.num)
          from place_refs pr
        ), '[]'::jsonb)
      ) into result;
      perform public.record_loop_activity(target_group, 'csv_downloaded');
      return result;
    end;
    $function$;


revoke all on function public.export_loop_data(uuid) from public, anon;
grant execute on function public.export_loop_data(uuid) to authenticated, service_role;

-- Milestone dismissals.
create table if not exists public.lunch_loop_milestone_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  milestone_key text not null check (char_length(milestone_key) between 1 and 80 and milestone_key ~ '^[a-z0-9:_-]+$'),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, group_id, milestone_key)
);
alter table public.lunch_loop_milestone_dismissals enable row level security;
revoke all on table public.lunch_loop_milestone_dismissals from public, anon, authenticated;
grant select, insert on table public.lunch_loop_milestone_dismissals to authenticated;
grant all on table public.lunch_loop_milestone_dismissals to service_role;
drop policy if exists "people read their milestone dismissals" on public.lunch_loop_milestone_dismissals;
create policy "people read their milestone dismissals" on public.lunch_loop_milestone_dismissals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "members dismiss their own milestones" on public.lunch_loop_milestone_dismissals;
create policy "members dismiss their own milestones" on public.lunch_loop_milestone_dismissals
  for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id));
