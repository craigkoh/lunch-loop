-- Lunch Loop logical backup query (read-only).
-- Run against production with the Supabase MCP execute_sql tool (or psql),
-- save the raw result to a file, then run scripts/backup/lunch-loop-backup.sh.
-- Contains no secrets. The OUTPUT contains user data: keep it private.
-- When a migration adds a public table, add it here; the script warns about
-- any public table that is missing.
select json_build_object(
  'taken_at', now(),
  'public_tables', (select json_agg(c.relname order by c.relname) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'),
  'migrations', (select json_agg(version order by version) from supabase_migrations.schema_migrations),
  'counts', json_build_object(
    'group_discord_notifications', (select count(*) from public.group_discord_notifications),
    'group_member_invitations', (select count(*) from public.group_member_invitations),
    'group_member_share_invitations', (select count(*) from public.group_member_share_invitations),
    'group_members', (select count(*) from public.group_members),
    'groups', (select count(*) from public.groups),
    'loop_creation_invitations', (select count(*) from public.loop_creation_invitations),
    'lunch_loop_feedback', (select count(*) from public.lunch_loop_feedback),
    'lunch_loop_invite_requests', (select count(*) from public.lunch_loop_invite_requests),
    'lunch_loop_member_notifications', (select count(*) from public.lunch_loop_member_notifications),
    'lunch_session_candidates', (select count(*) from public.lunch_session_candidates),
    'lunch_sessions', (select count(*) from public.lunch_sessions),
    'places_api_usage_events', (select count(*) from public.places_api_usage_events),
    'profiles', (select count(*) from public.profiles),
    'restaurants', (select count(*) from public.restaurants),
    'site_admins', (select count(*) from public.site_admins),
    'site_settings', (select count(*) from public.site_settings),
    'user_account_identities', (select count(*) from public.user_account_identities),
    'user_action_rate_limits', (select count(*) from public.user_action_rate_limits),
    'vetoes', (select count(*) from public.vetoes)
  ),
  'auth_users', (select coalesce(json_agg(json_build_object('id', id, 'email', email,
     'created_at', created_at, 'last_sign_in_at', last_sign_in_at,
     'provider', raw_app_meta_data->>'provider') order by created_at), '[]'::json) from auth.users),
  'group_discord_notifications', (select coalesce(json_agg(t), '[]'::json) from public.group_discord_notifications t),
  'group_member_invitations', (select coalesce(json_agg(t), '[]'::json) from public.group_member_invitations t),
  'group_member_share_invitations', (select coalesce(json_agg(t), '[]'::json) from public.group_member_share_invitations t),
  'group_members', (select coalesce(json_agg(t), '[]'::json) from public.group_members t),
  'groups', (select coalesce(json_agg(t), '[]'::json) from public.groups t),
  'loop_creation_invitations', (select coalesce(json_agg(t), '[]'::json) from public.loop_creation_invitations t),
  'lunch_loop_feedback', (select coalesce(json_agg(t), '[]'::json) from public.lunch_loop_feedback t),
  'lunch_loop_invite_requests', (select coalesce(json_agg(t), '[]'::json) from public.lunch_loop_invite_requests t),
  'lunch_loop_member_notifications', (select coalesce(json_agg(t), '[]'::json) from public.lunch_loop_member_notifications t),
  'lunch_session_candidates', (select coalesce(json_agg(t), '[]'::json) from public.lunch_session_candidates t),
  'lunch_sessions', (select coalesce(json_agg(t), '[]'::json) from public.lunch_sessions t),
  'places_api_usage_events', (select coalesce(json_agg(t), '[]'::json) from public.places_api_usage_events t),
  'profiles', (select coalesce(json_agg(t), '[]'::json) from public.profiles t),
  'restaurants', (select coalesce(json_agg(t), '[]'::json) from public.restaurants t),
  'site_admins', (select coalesce(json_agg(t), '[]'::json) from public.site_admins t),
  'site_settings', (select coalesce(json_agg(t), '[]'::json) from public.site_settings t),
  'user_account_identities', (select coalesce(json_agg(t), '[]'::json) from public.user_account_identities t),
  'user_action_rate_limits', (select coalesce(json_agg(t), '[]'::json) from public.user_action_rate_limits t),
  'vetoes', (select coalesce(json_agg(t), '[]'::json) from public.vetoes t)
) as backup;
