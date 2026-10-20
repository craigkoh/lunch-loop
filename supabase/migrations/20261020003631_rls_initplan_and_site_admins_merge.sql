-- Look up the signed-in person once per policy check, and fold the two
-- permissive site-admin read policies into one policy with the same access.
-- Applied on the hosted project on 2026-10-19 and recorded in migration
-- history as version 20261020003631.
-- DROP POLICY IF EXISTS lets a local reset, or a second run of this file,
-- reach the same end state as production.

alter policy "profiles visible to shared group" on public.profiles
  using ((id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (public.group_members mine
     JOIN public.group_members theirs ON ((mine.group_id = theirs.group_id)))
  WHERE ((mine.user_id = (select auth.uid())) AND (theirs.user_id = profiles.id)))));

alter policy "users edit own profile" on public.profiles
  using ((id = (select auth.uid()))) with check ((id = (select auth.uid())));

drop policy if exists "site admins view their role" on public.site_admins;
drop policy if exists "site admins view all site admins" on public.site_admins;
drop policy if exists "site admins view their role or all if admin" on public.site_admins;
create policy "site admins view their role or all if admin" on public.site_admins
  as permissive for select to authenticated
  using ((user_id = (select auth.uid())) OR public.is_site_admin());
