-- Build 2026.10.31.74: the activity-log trigger functions are only ever run by
-- their triggers. Nobody needs to call them directly, so take EXECUTE away from
-- PUBLIC, anon and authenticated (clears the Supabase security advisor warnings
-- "anon/authenticated security definer function executable"). Triggers keep
-- firing: Postgres checks EXECUTE on a trigger function only when the trigger
-- is created, not each time it fires.
revoke execute on function public.log_lunch_session_activity() from public, anon, authenticated;
revoke execute on function public.log_candidate_activity() from public, anon, authenticated;
revoke execute on function public.log_veto_activity() from public, anon, authenticated;
revoke execute on function public.log_restaurant_activity() from public, anon, authenticated;
revoke execute on function public.log_member_activity() from public, anon, authenticated;
