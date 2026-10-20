-- Cover foreign keys that had no index of their own.
-- Applied on the hosted project on 2026-10-19 and recorded in migration
-- history as version 20261020003630. CREATE INDEX IF NOT EXISTS matches the
-- statements that already ran, so applying this file again does not create
-- a second index.

create index if not exists lunch_loop_invite_requests_reviewed_by_fk_idx on public.lunch_loop_invite_requests (reviewed_by);
create index if not exists group_member_invitations_accepted_by_fk_idx on public.group_member_invitations (accepted_by);
create index if not exists group_member_invitations_invited_by_fk_idx on public.group_member_invitations (invited_by);
create index if not exists loop_creation_invitations_accepted_by_fk_idx on public.loop_creation_invitations (accepted_by);
create index if not exists loop_creation_invitations_created_group_id_fk_idx on public.loop_creation_invitations (created_group_id);
create index if not exists loop_creation_invitations_invited_by_fk_idx on public.loop_creation_invitations (invited_by);
create index if not exists lunch_loop_feedback_duplicate_of_fk_idx on public.lunch_loop_feedback (duplicate_of);
create index if not exists lunch_loop_feedback_group_id_fk_idx on public.lunch_loop_feedback (group_id);
create index if not exists lunch_loop_feedback_user_id_fk_idx on public.lunch_loop_feedback (user_id);
create index if not exists site_settings_updated_by_fk_idx on public.site_settings (updated_by);
create index if not exists profiles_active_group_id_fk_idx on public.profiles (active_group_id);
create index if not exists group_members_user_id_fk_idx on public.group_members (user_id);
create index if not exists lunch_sessions_final_restaurant_id_fk_idx on public.lunch_sessions (final_restaurant_id);
create index if not exists lunch_sessions_suggester_id_fk_idx on public.lunch_sessions (suggester_id);
create index if not exists groups_archived_by_fk_idx on public.groups (archived_by);
create index if not exists restaurants_added_by_fk_idx on public.restaurants (added_by);
create index if not exists lunch_session_candidates_restaurant_id_fk_idx on public.lunch_session_candidates (restaurant_id);
create index if not exists vetoes_candidate_id_fk_idx on public.vetoes (candidate_id);
create index if not exists vetoes_user_id_fk_idx on public.vetoes (user_id);
create index if not exists group_discord_notifications_updated_by_fk_idx on public.group_discord_notifications (updated_by);
create index if not exists site_admins_granted_by_fk_idx on public.site_admins (granted_by);
create index if not exists lunch_loop_member_notifications_created_by_fk_idx on public.lunch_loop_member_notifications (created_by);
create index if not exists lunch_loop_member_notifications_group_id_fk_idx on public.lunch_loop_member_notifications (group_id);
create index if not exists group_member_share_invitations_accepted_by_fk_idx on public.group_member_share_invitations (accepted_by);
create index if not exists group_member_share_invitations_invited_by_fk_idx on public.group_member_share_invitations (invited_by);
