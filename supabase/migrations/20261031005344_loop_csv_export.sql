-- Loop CSV export (build 2026.10.30.72).
-- A member of an active loop can download that loop's own lunch data.
-- Members only: site admins get no bypass here. No emails. No Google place
-- details (name, address, rating, phone, hours, coordinates): only the
-- place_id, which Google lets apps keep, so the app can build a Google Maps
-- link. Places are labeled with Lunch Loop's own short refs (P1, P2, ...).
-- Limit: 5 downloads per person per day (enforce_user_rate_limit).
-- Apply to staging first. Apply to production only after merge, after a backup.

alter table public.user_action_rate_limits drop constraint if exists user_action_rate_limits_action_name_check;
alter table public.user_action_rate_limits add constraint user_action_rate_limits_action_name_check
  check (action_name = any (array['create_group'::text, 'join_group'::text, 'create_first_lunch_loop'::text, 'create_loop_creation_invitation'::text, 'export_loop_csv'::text]));

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
      return result;
    end;
    $function$;

revoke all on function public.export_loop_data(uuid) from public, anon;
grant execute on function public.export_loop_data(uuid) to authenticated, service_role;
