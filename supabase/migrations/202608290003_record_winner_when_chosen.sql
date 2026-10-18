-- A winning restaurant becomes a recorded pick as soon as the decision is final.
-- This single DO statement works with the Supabase linked-query runner.
do $migration$
begin
  execute 'alter table public.lunch_sessions add column if not exists winner_recorded_at timestamptz';

  -- Completed loops were already counted by the prior close-loop implementation.
  execute $sql$
    update public.lunch_sessions
    set winner_recorded_at = coalesce(completed_at, started_at)
    where status = 'completed' and winner_recorded_at is null
  $sql$;

  -- Bring any already-decided loop into the new model exactly once.
  execute $sql$
    with newly_recorded as (
      update public.lunch_sessions
      set winner_recorded_at = now()
      where status = 'chosen'
        and final_restaurant_id is not null
        and winner_recorded_at is null
      returning group_id, final_restaurant_id
    )
    update public.restaurants restaurant
    set visit_count = restaurant.visit_count + 1,
        last_visited_at = now()
    from newly_recorded winner
    where restaurant.id = winner.final_restaurant_id
      and restaurant.group_id = winner.group_id
  $sql$;

  execute $function$
    create or replace function public.finalize_lunch_session(target_session uuid, winning_restaurant uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare session_group uuid; survivor_count integer;
    begin
      select group_id into session_group from public.lunch_sessions where id = target_session and status = 'active' for update;
      if session_group is null or not public.is_group_member(session_group) then raise exception 'Lunch decision is not available'; end if;
      select count(*) into survivor_count
      from public.lunch_session_candidates candidate
      where candidate.session_id = target_session
        and not exists(select 1 from public.vetoes veto where veto.session_id = target_session and veto.candidate_id = candidate.id);
      if survivor_count <> 1 then raise exception 'A lunch decision can only finalize when exactly one choice remains'; end if;
      if not exists(
        select 1 from public.lunch_session_candidates candidate
        where candidate.session_id = target_session and candidate.restaurant_id = winning_restaurant
          and not exists(select 1 from public.vetoes veto where veto.session_id = target_session and veto.candidate_id = candidate.id)
      ) then raise exception 'The winner must be the one remaining choice'; end if;

      update public.lunch_sessions
      set status = 'chosen', final_restaurant_id = winning_restaurant, winner_recorded_at = now()
      where id = target_session;
      update public.restaurants
      set visit_count = visit_count + 1, last_visited_at = now()
      where id = winning_restaurant and group_id = session_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.close_lunch_loop(target_session uuid)
    returns void language plpgsql security definer set search_path = public as $body$
    declare session_group uuid; lunch_time timestamptz;
    begin
      select group_id, scheduled_for into session_group, lunch_time
      from public.lunch_sessions where id = target_session and status = 'chosen' for update;
      if session_group is null or not public.is_group_member(session_group) then raise exception 'This lunch loop is not available'; end if;
      if lunch_time > now() then raise exception 'This lunch loop can close after its scheduled time'; end if;
      update public.lunch_sessions set status = 'completed', completed_at = now() where id = target_session;
    end;
    $body$
  $function$;

  execute 'grant execute on function public.finalize_lunch_session(uuid, uuid), public.close_lunch_loop(uuid) to authenticated';
end;
$migration$;
