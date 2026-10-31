-- UI refresh follow-up (build 2026.10.31.73): keep the activity log append-only,
-- but let account deletion clear actor_id / subject_user_id (on delete set null).
create or replace function public.prevent_loop_activity_update()
 returns trigger language plpgsql set search_path to 'public', 'pg_catalog'
as $$
begin
  if new.id = old.id and new.occurred_at = old.occurred_at and new.group_id = old.group_id
     and new.event_type = old.event_type and new.session_id is not distinct from old.session_id
     and new.restaurant_id is not distinct from old.restaurant_id and new.details = old.details
     and (new.actor_id is not distinct from old.actor_id or new.actor_id is null)
     and (new.subject_user_id is not distinct from old.subject_user_id or new.subject_user_id is null) then
    return new;
  end if;
  raise exception 'Loop activity is append-only';
end;
$$;
