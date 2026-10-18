begin;

-- A deleted account must not leave its old name or account record attached to
-- a shared crew's history. Keep the history itself (which belongs to the
-- crew), but make its account references nullable and de-identify them during
-- the account-delete transaction below.
alter table public.lunch_sessions
  alter column suggester_id drop not null;
alter table public.lunch_sessions
  drop constraint if exists lunch_sessions_suggester_id_fkey;
alter table public.lunch_sessions
  add constraint lunch_sessions_suggester_id_fkey
  foreign key (suggester_id) references public.profiles(id) on delete set null;

alter table public.vetoes
  alter column user_id drop not null;
alter table public.vetoes
  drop constraint if exists vetoes_user_id_fkey;
alter table public.vetoes
  add constraint vetoes_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.profiles
  add column if not exists theme_preference text not null default 'system'
  check (theme_preference in ('system', 'light', 'dark'));

-- This is deliberately a separate, authenticated view from the export. It
-- lets the UI explain the exact effects before it enables an irreversible
-- action, while revealing only the caller's own memberships.
create or replace function public.get_my_account_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception 'Sign in before managing your account';
  end if;

  return jsonb_build_object(
    'theme_preference', coalesce(
      (select profile.theme_preference from public.profiles profile where profile.id = account_id),
      'system'
    ),
    'sole_global_admin', (
      exists(select 1 from public.site_admins admin where admin.user_id = account_id)
      and not exists(select 1 from public.site_admins admin where admin.user_id <> account_id)
    ),
    'owned_loops_requiring_transfer', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', membership.group_id,
        'group_name', lunch_group.name,
        'member_count', member_counts.member_count
      ) order by lunch_group.name), '[]'::jsonb)
      from public.group_members membership
      join public.groups lunch_group on lunch_group.id = membership.group_id
      cross join lateral (
        select count(*)::integer as member_count
        from public.group_members crew_member
        where crew_member.group_id = membership.group_id
      ) member_counts
      where membership.user_id = account_id
        and membership.role = 'owner'
        and member_counts.member_count > 1
        and not exists (
          select 1
          from public.group_members other_owner
          where other_owner.group_id = membership.group_id
            and other_owner.user_id <> account_id
            and other_owner.role = 'owner'
        )
    ),
    'single_member_owned_loops_to_delete', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', membership.group_id,
        'group_name', lunch_group.name
      ) order by lunch_group.name), '[]'::jsonb)
      from public.group_members membership
      join public.groups lunch_group on lunch_group.id = membership.group_id
      where membership.user_id = account_id
        and 1 = (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
    ),
    'shared_loops_to_leave', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', membership.group_id,
        'group_name', lunch_group.name,
        'role', membership.role,
        'member_count', (select count(*)::integer from public.group_members crew_member where crew_member.group_id = membership.group_id)
      ) order by lunch_group.name), '[]'::jsonb)
      from public.group_members membership
      join public.groups lunch_group on lunch_group.id = membership.group_id
      where membership.user_id = account_id
        and 1 < (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
        and not (
          membership.role = 'owner'
          and not exists (
            select 1
            from public.group_members other_owner
            where other_owner.group_id = membership.group_id
              and other_owner.user_id <> account_id
              and other_owner.role = 'owner'
          )
        )
    ),
    'active_decision_loops', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', membership.group_id,
        'group_name', lunch_group.name
      ) order by lunch_group.name), '[]'::jsonb)
      from public.group_members membership
      join public.groups lunch_group on lunch_group.id = membership.group_id
      where membership.user_id = account_id
        and 1 < (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
        and exists (
          select 1
          from public.lunch_sessions session_record
          where session_record.group_id = membership.group_id
            and session_record.status in ('active', 'chosen')
        )
    )
  );
end;
$body$;

create or replace function public.get_my_lunch_theme_preference()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if auth.uid() is null then
    raise exception 'Sign in before reading your theme';
  end if;
  return coalesce(
    (select profile.theme_preference from public.profiles profile where profile.id = auth.uid()),
    'system'
  );
end;
$body$;

create or replace function public.set_my_lunch_theme_preference(new_preference text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  account_id uuid := auth.uid();
  normalized_preference text := lower(trim(coalesce(new_preference, '')));
begin
  if account_id is null then
    raise exception 'Sign in before changing your theme';
  end if;
  if normalized_preference not in ('system', 'light', 'dark') then
    raise exception 'Choose system, light, or dark';
  end if;

  -- This also creates the private identity record for a newly signed-in
  -- person who has not joined or created a Lunch Loop yet.
  perform public.sync_lunch_profile(null);
  update public.profiles
  set theme_preference = normalized_preference
  where id = account_id;
  return normalized_preference;
end;
$body$;

-- Export only records belonging to the signed-in account. The caller receives
-- their identity details and their own contributions, never another member's
-- account directory or a whole shared-loop export.
create or replace function public.export_my_lunch_account_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    raise exception 'Sign in before exporting your account data';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object(
      'profile', (select to_jsonb(profile) from public.profiles profile where profile.id = account_id),
      -- Select exportable identity fields explicitly. Do not make this export
      -- accidentally widen if this private table gains internal columns.
      'identity', (select jsonb_build_object(
        'email', identity.email,
        'provider', identity.provider,
        'avatar_url', identity.avatar_url,
        'google_full_name', identity.google_full_name,
        'last_synced_at', identity.last_synced_at
      ) from public.user_account_identities identity where identity.user_id = account_id)
    ),
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', membership.group_id,
        'group_name', lunch_group.name,
        'role', membership.role,
        'joined_at', membership.joined_at,
        'status', lunch_group.status
      ) order by membership.joined_at), '[]'::jsonb)
      from public.group_members membership
      join public.groups lunch_group on lunch_group.id = membership.group_id
      where membership.user_id = account_id
    ),
    'restaurant_additions', (
      select coalesce(jsonb_agg(to_jsonb(restaurant) order by restaurant.created_at), '[]'::jsonb)
      from public.restaurants restaurant
      where restaurant.added_by = account_id
    ),
    'picks', (
      select coalesce(jsonb_agg(to_jsonb(session_record) order by session_record.started_at), '[]'::jsonb)
      from public.lunch_sessions session_record
      where session_record.suggester_id = account_id
    ),
    'vetoes', (
      select coalesce(jsonb_agg(to_jsonb(veto) order by veto.created_at), '[]'::jsonb)
      from public.vetoes veto
      where veto.user_id = account_id
    ),
    'feedback', (
      -- admin_note is private staff working context, not account data shown
      -- back to a reporter. Keep exports aligned with the feedback UI.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', feedback.id,
        'group_id', feedback.group_id,
        'kind', feedback.kind,
        'title', feedback.title,
        'details', feedback.details,
        'page_path', feedback.page_path,
        'build', feedback.build,
        'status', feedback.status,
        'priority', feedback.priority,
        'reporter_note', feedback.reporter_note,
        'created_at', feedback.created_at,
        'updated_at', feedback.updated_at
      ) order by feedback.created_at), '[]'::jsonb)
      from public.lunch_loop_feedback feedback
      where feedback.user_id = account_id
    )
  );
end;
$body$;

-- Delete only the caller. A typed phrase is checked again in the database so
-- a browser bug or a forged request cannot turn this into an unconfirmed or
-- cross-account deletion. Shared records stay with their loops; deleting the
-- profile makes their contributor references null through the FKs above.
create or replace function public.delete_my_lunch_account(confirmation_phrase text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  account_id uuid := auth.uid();
  blocking_loops text;
  active_decision_loops text;
  target_group uuid;
begin
  if account_id is null then
    raise exception 'Sign in before deleting your account';
  end if;
  if trim(coalesce(confirmation_phrase, '')) <> 'DELETE MY ACCOUNT' then
    raise exception 'Type DELETE MY ACCOUNT to permanently delete your account';
  end if;
  if exists(select 1 from public.site_admins admin where admin.user_id = account_id)
    and not exists(select 1 from public.site_admins admin where admin.user_id <> account_id) then
    raise exception 'Add another Global Admin before deleting the only site-admin account';
  end if;

  -- Match the roster/create-round lock so a new member or a new decision
  -- cannot race this final account-lifecycle check.
  for target_group in
    select membership.group_id
    from public.group_members membership
    where membership.user_id = account_id
    order by membership.group_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('lunch-loop-roster:' || target_group::text, 0));
  end loop;

  select string_agg(lunch_group.name, ', ' order by lunch_group.name)
  into active_decision_loops
  from public.group_members membership
  join public.groups lunch_group on lunch_group.id = membership.group_id
  where membership.user_id = account_id
    and 1 < (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
    and exists (
      select 1 from public.lunch_sessions session_record
      where session_record.group_id = membership.group_id
        and session_record.status in ('active', 'chosen')
    );
  if active_decision_loops is not null then
    raise exception 'Finish or cancel the active meal decision in % before deleting your account', active_decision_loops;
  end if;

  select string_agg(lunch_group.name, ', ' order by lunch_group.name)
  into blocking_loops
  from public.group_members membership
  join public.groups lunch_group on lunch_group.id = membership.group_id
  where membership.user_id = account_id
    and membership.role = 'owner'
    and 1 < (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
    and not exists (
      select 1 from public.group_members other_owner
      where other_owner.group_id = membership.group_id
        and other_owner.user_id <> account_id
        and other_owner.role = 'owner'
    );
  if blocking_loops is not null then
    raise exception 'Transfer ownership of % before deleting your account', blocking_loops;
  end if;

  -- A one-person loop exists only for this account, so remove that entire
  -- private loop. Delete sessions before restaurants to preserve the
  -- candidate/winner foreign-key ordering on every PostgreSQL version.
  for target_group in
    select membership.group_id
    from public.group_members membership
    where membership.user_id = account_id
      and 1 = (select count(*) from public.group_members crew_member where crew_member.group_id = membership.group_id)
  loop
    delete from public.lunch_sessions where group_id = target_group;
    delete from public.restaurants where group_id = target_group;
    delete from public.groups where id = target_group;
  end loop;

  -- Shared loops continue without this account. Re-number their roster before
  -- the profile cascade so future rotation and invitations remain compact.
  for target_group in
    select membership.group_id
    from public.group_members membership
    where membership.user_id = account_id
  loop
    delete from public.group_members
    where group_id = target_group and user_id = account_id;

    -- group_members has a unique (group_id, rotation_order) constraint, so
    -- make room before compacting a roster whose positions may shift down.
    update public.group_members
    set rotation_order = rotation_order + 1000
    where group_id = target_group;

    update public.group_members member
    set rotation_order = reordered.next_order
    from (
      select user_id, row_number() over (order by rotation_order, joined_at, user_id) - 1 as next_order
      from public.group_members
      where group_id = target_group
    ) reordered
    where member.group_id = target_group
      and member.user_id = reordered.user_id;
  end loop;

  -- auth.users is the source of truth. Its cascade removes the remaining
  -- profile, private identity, feedback, rate-limit and invitation records.
  delete from auth.users where id = account_id;
  if not found then
    raise exception 'Your account is no longer available';
  end if;
end;
$body$;

revoke all on function public.get_my_account_lifecycle(), public.get_my_lunch_theme_preference(), public.set_my_lunch_theme_preference(text), public.export_my_lunch_account_data(), public.delete_my_lunch_account(text) from public, anon, authenticated;
grant execute on function public.get_my_account_lifecycle(), public.get_my_lunch_theme_preference(), public.set_my_lunch_theme_preference(text), public.export_my_lunch_account_data(), public.delete_my_lunch_account(text) to authenticated;

notify pgrst, 'reload schema';
commit;
