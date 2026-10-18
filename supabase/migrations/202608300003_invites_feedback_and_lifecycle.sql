-- Owner-controlled invitations, future-ready multi-loop memberships, owner
-- lifecycle controls, and a signed-in feedback queue. Private data is exposed
-- only through narrowly scoped SECURITY DEFINER RPCs.

do $migration$
begin
  execute 'alter table public.profiles add column if not exists active_group_id uuid references public.groups(id) on delete set null';
  execute 'alter table public.groups add column if not exists archived_at timestamptz';
  execute 'alter table public.groups add column if not exists archived_by uuid references public.profiles(id) on delete set null';
  execute 'alter table public.groups add column if not exists delete_scheduled_for timestamptz';
  execute 'alter table public.groups drop constraint if exists groups_status_check';
  execute $$alter table public.groups add constraint groups_status_check check (status in ('active', 'suspended', 'archived'))$$;
  execute 'alter table public.site_settings add column if not exists member_invite_limit_per_day integer check (member_invite_limit_per_day is null or member_invite_limit_per_day between 1 and 1000)';

  execute $sql$
    create table if not exists public.group_member_invitations (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      invited_by uuid not null references public.profiles(id) on delete cascade,
      recipient_email text not null,
      token_hash text not null unique,
      short_code_hash text not null unique,
      status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
      expires_at timestamptz not null,
      accepted_at timestamptz,
      accepted_by uuid references public.profiles(id) on delete set null,
      revoked_at timestamptz,
      created_at timestamptz not null default now(),
      constraint group_member_invitation_email_length check (char_length(recipient_email) between 3 and 320)
    )
  $sql$;
  execute 'create index if not exists group_member_invitations_group_idx on public.group_member_invitations(group_id, status, created_at desc)';
  execute 'alter table public.group_member_invitations enable row level security';

  execute $sql$
    create table if not exists public.loop_creation_invitations (
      id uuid primary key default gen_random_uuid(),
      invited_by uuid not null references public.profiles(id) on delete cascade,
      source_group_id uuid not null references public.groups(id) on delete cascade,
      recipient_email text not null,
      token_hash text not null unique,
      status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
      expires_at timestamptz not null,
      accepted_at timestamptz,
      accepted_by uuid references public.profiles(id) on delete set null,
      created_group_id uuid references public.groups(id) on delete set null,
      revoked_at timestamptz,
      created_at timestamptz not null default now(),
      constraint loop_creation_invitation_email_length check (char_length(recipient_email) between 3 and 320)
    )
  $sql$;
  execute 'create index if not exists loop_creation_invitations_source_idx on public.loop_creation_invitations(source_group_id, status, created_at desc)';
  execute 'alter table public.loop_creation_invitations enable row level security';

  execute $sql$
    create table if not exists public.lunch_loop_feedback (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      group_id uuid references public.groups(id) on delete set null,
      kind text not null check (kind in ('bug', 'feature', 'question', 'other')),
      title text not null,
      details text not null,
      page_path text,
      build text,
      status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'in_progress', 'shipped', 'declined', 'duplicate')),
      priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
      admin_note text,
      duplicate_of uuid references public.lunch_loop_feedback(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint lunch_loop_feedback_title_length check (char_length(trim(title)) between 3 and 140),
      constraint lunch_loop_feedback_details_length check (char_length(trim(details)) between 10 and 5000),
      constraint lunch_loop_feedback_page_path_length check (char_length(coalesce(page_path, '')) <= 500),
      constraint lunch_loop_feedback_build_length check (char_length(coalesce(build, '')) <= 80),
      constraint lunch_loop_feedback_admin_note_length check (char_length(coalesce(admin_note, '')) <= 2000)
    )
  $sql$;
  execute 'create index if not exists lunch_loop_feedback_queue_idx on public.lunch_loop_feedback(status, priority, created_at desc)';
  execute 'alter table public.lunch_loop_feedback enable row level security';

  execute $function$
    create or replace function public.touch_lunch_loop_feedback_updated_at()
    returns trigger language plpgsql set search_path = public, pg_catalog as $body$
    begin new.updated_at = now(); return new; end;
    $body$
  $function$;
  execute 'drop trigger if exists lunch_loop_feedback_touch_updated_at on public.lunch_loop_feedback';
  execute 'create trigger lunch_loop_feedback_touch_updated_at before update on public.lunch_loop_feedback for each row execute function public.touch_lunch_loop_feedback_updated_at()';

  execute $function$
    create or replace function public.ensure_lunch_loop_invite_limit(target_group uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare daily_limit integer; sent_count integer;
    begin
      select member_invite_limit_per_day into daily_limit from public.site_settings where singleton;
      if daily_limit is null then return; end if;
      select count(*) into sent_count from public.group_member_invitations
      where group_id = target_group and invited_by = auth.uid() and created_at > now() - interval '1 day';
      if sent_count >= daily_limit then raise exception 'This Lunch Loop has reached its configured invitation limit for today'; end if;
    end;
    $body$
  $function$;

  -- Fix the legacy parameter/column ambiguity before group-creation paths use
  -- the rate limiter again.
  execute $function$
    create or replace function public.enforce_user_rate_limit(action_name text, maximum_attempts integer, period interval)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare current_limit public.user_action_rate_limits%rowtype; requested_action text := action_name;
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      if maximum_attempts < 1 or period <= interval '0 seconds' then raise exception 'Invalid rate limit configuration'; end if;
      select * into current_limit from public.user_action_rate_limits rate_limit
      where rate_limit.user_id = auth.uid() and rate_limit.action_name = requested_action for update;
      if not found then
        insert into public.user_action_rate_limits(user_id, action_name, attempts) values (auth.uid(), requested_action, 1);
      elsif current_limit.window_started_at + period <= now() then
        update public.user_action_rate_limits rate_limit set window_started_at = now(), attempts = 1
        where rate_limit.user_id = auth.uid() and rate_limit.action_name = requested_action;
      elsif current_limit.attempts >= maximum_attempts then
        raise exception 'Too many attempts. Please wait and try again.';
      else
        update public.user_action_rate_limits rate_limit set attempts = attempts + 1
        where rate_limit.user_id = auth.uid() and rate_limit.action_name = requested_action;
      end if;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_my_lunch_loops()
    returns table(group_id uuid, group_name text, role text, status text, active boolean, member_count bigint, created_at timestamptz, delete_scheduled_for timestamptz)
    language sql security definer set search_path = public, pg_catalog as $body$
      select group_record.id, group_record.name, member.role, group_record.status,
        profile.active_group_id = group_record.id,
        (select count(*) from public.group_members each_member where each_member.group_id = group_record.id),
        group_record.created_at, group_record.delete_scheduled_for
      from public.group_members member
      join public.groups group_record on group_record.id = member.group_id
      join public.profiles profile on profile.id = auth.uid()
      where member.user_id = auth.uid()
      order by (profile.active_group_id = group_record.id) desc, group_record.created_at desc
    $body$
  $function$;

  execute $function$
    create or replace function public.set_active_lunch_loop(target_group uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      if not exists(
        select 1 from public.group_members member join public.groups group_record on group_record.id = member.group_id
        where member.group_id = target_group and member.user_id = auth.uid() and group_record.status = 'active'
      ) then raise exception 'Choose an active Lunch Loop you belong to'; end if;
      update public.profiles set active_group_id = target_group where id = auth.uid();
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.create_group_member_invitation(target_group uuid, target_email text)
    returns table(invitation_id uuid, invitation_token text, short_code text, expires_at timestamptz)
    language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
    declare raw_token text; raw_code text; invitation_record uuid; expiry timestamptz; normalized_email text;
    begin
      if auth.uid() is null or not public.is_group_owner(target_group) then raise exception 'Only this Lunch Loop''s owner can invite a crew member'; end if;
      if not exists(select 1 from public.groups where id = target_group and status = 'active') then raise exception 'This Lunch Loop is not accepting invitations'; end if;
      normalized_email := lower(trim(coalesce(target_email, '')));
      if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address'; end if;
      perform public.ensure_lunch_loop_invite_limit(target_group);
      raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      expiry := now() + interval '14 days';
      insert into public.group_member_invitations(group_id, invited_by, recipient_email, token_hash, short_code_hash, expires_at)
      values (target_group, auth.uid(), normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), encode(extensions.digest(raw_code, 'sha256'), 'hex'), expiry)
      returning id into invitation_record;
      return query select invitation_record, raw_token, substring(raw_code from 1 for 4) || '-' || substring(raw_code from 5 for 4) || '-' || substring(raw_code from 9 for 4), expiry;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_group_member_invitations(target_group uuid)
    returns table(id uuid, recipient_email text, status text, expires_at timestamptz, created_at timestamptz, accepted_at timestamptz)
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_group_owner(target_group) then raise exception 'Only this Lunch Loop''s owner can view its invitations'; end if;
      update public.group_member_invitations set status = 'expired' where group_id = target_group and status = 'pending' and expires_at <= now();
      return query select invitation.id, invitation.recipient_email, invitation.status, invitation.expires_at, invitation.created_at, invitation.accepted_at
      from public.group_member_invitations invitation where invitation.group_id = target_group order by invitation.created_at desc;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.revoke_group_member_invitation(target_invitation uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      update public.group_member_invitations invitation set status = 'revoked', revoked_at = now()
      where invitation.id = target_invitation and invitation.status = 'pending'
      and public.is_group_owner(invitation.group_id);
      if not found then raise exception 'That pending invitation is not available'; end if;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.redeem_group_member_invitation(raw_token text, raw_code text default null, new_display_name text default null)
    returns uuid language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
    declare invitation public.group_member_invitations%rowtype; account_email text; next_order smallint;
    begin
      if auth.uid() is null then raise exception 'Sign in before joining a Lunch Loop'; end if;
      select lower(email) into account_email from auth.users where id = auth.uid();
      update public.group_member_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
      select * into invitation from public.group_member_invitations
      where status = 'pending' and expires_at > now() and (
        (nullif(trim(coalesce(raw_token, '')), '') <> '' and token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex')) or
        (nullif(regexp_replace(coalesce(raw_code, ''), '[^A-Za-z0-9]', '', 'g'), '') <> '' and short_code_hash = encode(extensions.digest(upper(regexp_replace(raw_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex'))
      ) for update;
      if not found then raise exception 'That invitation is unavailable, expired, or already used'; end if;
      if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email; end if;
      if not exists(select 1 from public.groups where id = invitation.group_id and status = 'active') then raise exception 'This Lunch Loop is not available'; end if;
      if not exists(select 1 from public.group_members where group_id = invitation.group_id and user_id = auth.uid())
        and (select count(*) from public.group_members where group_id = invitation.group_id) >= 6 then raise exception 'This Lunch Loop already has its six members'; end if;
      perform public.sync_lunch_profile(new_display_name);
      select coalesce(max(rotation_order) + 1, 0) into next_order from public.group_members where group_id = invitation.group_id;
      insert into public.group_members(group_id, user_id, rotation_order) values (invitation.group_id, auth.uid(), next_order) on conflict (group_id, user_id) do nothing;
      update public.group_member_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
      update public.profiles set active_group_id = invitation.group_id where id = auth.uid();
      return invitation.group_id;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.create_loop_creation_invitation(target_group uuid, target_email text)
    returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare raw_token text; invitation_record uuid; expiry timestamptz; normalized_email text;
    begin
      if auth.uid() is null or not public.is_group_member(target_group) then raise exception 'Join an active Lunch Loop before referring a new one'; end if;
      normalized_email := lower(trim(coalesce(target_email, '')));
      if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address'; end if;
      raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      expiry := now() + interval '14 days';
      insert into public.loop_creation_invitations(invited_by, source_group_id, recipient_email, token_hash, expires_at)
      values (auth.uid(), target_group, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expiry)
      returning id into invitation_record;
      return query select invitation_record, raw_token, expiry;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.redeem_loop_creation_invitation(raw_token text, new_group_name text, new_display_name text)
    returns uuid language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
    declare invitation public.loop_creation_invitations%rowtype; account_email text; new_group uuid;
    begin
      if auth.uid() is null then raise exception 'Sign in before creating a Lunch Loop'; end if;
      if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Give your Lunch Loop a name between 1 and 80 characters'; end if;
      select lower(email) into account_email from auth.users where id = auth.uid();
      update public.loop_creation_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
      select * into invitation from public.loop_creation_invitations where status = 'pending' and expires_at > now()
      and token_hash = encode(extensions.digest(trim(coalesce(raw_token, '')), 'sha256'), 'hex') for update;
      if not found then raise exception 'That new-loop invitation is unavailable, expired, or already used'; end if;
      if account_email is null or lower(invitation.recipient_email) <> account_email then raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email; end if;
      if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= 2 then
        raise exception 'An account can own up to two active Lunch Loops';
      end if;
      perform public.sync_lunch_profile(new_display_name);
      insert into public.groups(name) values (trim(new_group_name)) returning id into new_group;
      insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
      update public.loop_creation_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), created_group_id = new_group where id = invitation.id;
      update public.profiles set active_group_id = new_group where id = auth.uid();
      return new_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_group_creation_invitations(target_group uuid)
    returns table(id uuid, recipient_email text, status text, expires_at timestamptz, created_at timestamptz)
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_group_member(target_group) then raise exception 'This Lunch Loop is not available'; end if;
      update public.loop_creation_invitations set status = 'expired' where source_group_id = target_group and status = 'pending' and expires_at <= now();
      return query select invitation.id, invitation.recipient_email, invitation.status, invitation.expires_at, invitation.created_at
      from public.loop_creation_invitations invitation
      where invitation.source_group_id = target_group
        and (invitation.invited_by = auth.uid() or public.is_group_owner(target_group))
      order by invitation.created_at desc;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.submit_lunch_loop_feedback(new_kind text, new_title text, new_details text, new_page_path text default null, new_build text default null)
    returns uuid language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare feedback_id uuid; context_group uuid;
    begin
      if auth.uid() is null then raise exception 'Sign in before sending feedback'; end if;
      if new_kind not in ('bug', 'feature', 'question', 'other') then raise exception 'Choose a feedback type'; end if;
      if char_length(trim(coalesce(new_title, ''))) not between 3 and 140 then raise exception 'Give feedback a short title between 3 and 140 characters'; end if;
      if char_length(trim(coalesce(new_details, ''))) not between 10 and 5000 then raise exception 'Add at least a little more detail so we can act on it'; end if;
      select active_group_id into context_group from public.profiles where id = auth.uid();
      insert into public.lunch_loop_feedback(user_id, group_id, kind, title, details, page_path, build)
      values (auth.uid(), context_group, new_kind, trim(new_title), trim(new_details), nullif(trim(new_page_path), ''), nullif(trim(new_build), ''))
      returning id into feedback_id;
      return feedback_id;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_my_lunch_loop_feedback()
    returns table(id uuid, kind text, title text, status text, priority text, created_at timestamptz, updated_at timestamptz)
    language sql security definer set search_path = public, pg_catalog as $body$
      select feedback.id, feedback.kind, feedback.title, feedback.status, feedback.priority, feedback.created_at, feedback.updated_at
      from public.lunch_loop_feedback feedback where feedback.user_id = auth.uid() order by feedback.created_at desc
    $body$
  $function$;

  execute $function$
    create or replace function public.get_site_lunch_loop_feedback()
    returns table(id uuid, user_id uuid, display_name text, account_email text, group_name text, kind text, title text, details text, page_path text, build text, status text, priority text, admin_note text, duplicate_of uuid, created_at timestamptz, updated_at timestamptz)
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      return query select feedback.id, feedback.user_id, profile.display_name, identity.email, group_record.name,
        feedback.kind, feedback.title, feedback.details, feedback.page_path, feedback.build, feedback.status, feedback.priority, feedback.admin_note, feedback.duplicate_of, feedback.created_at, feedback.updated_at
      from public.lunch_loop_feedback feedback
      join public.profiles profile on profile.id = feedback.user_id
      left join public.user_account_identities identity on identity.user_id = feedback.user_id
      left join public.groups group_record on group_record.id = feedback.group_id
      order by case feedback.status when 'new' then 0 when 'triaged' then 1 when 'planned' then 2 when 'in_progress' then 3 else 4 end,
        case feedback.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, feedback.created_at desc;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.update_site_lunch_loop_feedback(target_feedback uuid, new_status text, new_priority text, new_admin_note text default null, new_duplicate_of uuid default null)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      if new_status not in ('new', 'triaged', 'planned', 'in_progress', 'shipped', 'declined', 'duplicate') then raise exception 'Choose a valid feedback status'; end if;
      if new_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'Choose a valid priority'; end if;
      if char_length(trim(coalesce(new_admin_note, ''))) > 2000 then raise exception 'Keep the admin note to 2,000 characters or fewer'; end if;
      update public.lunch_loop_feedback set status = new_status, priority = new_priority,
        admin_note = nullif(trim(new_admin_note), ''), duplicate_of = new_duplicate_of where id = target_feedback;
      if not found then raise exception 'Feedback item was not found'; end if;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.transfer_lunch_loop_ownership(target_group uuid, new_owner uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_group_owner(target_group) then raise exception 'Only this Lunch Loop''s owner can transfer ownership'; end if;
      if new_owner = auth.uid() then raise exception 'Choose another crew member'; end if;
      if not exists(select 1 from public.group_members where group_id = target_group and user_id = new_owner) then raise exception 'Choose a current crew member'; end if;
      update public.group_members set role = 'member' where group_id = target_group and user_id = auth.uid();
      update public.group_members set role = 'owner' where group_id = target_group and user_id = new_owner;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.archive_lunch_loop(target_group uuid)
    returns timestamptz language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare deletion_time timestamptz;
    begin
      if not public.is_group_owner(target_group) then raise exception 'Only this Lunch Loop''s owner can archive it'; end if;
      if exists(select 1 from public.lunch_sessions where group_id = target_group and status in ('active', 'chosen')) then raise exception 'Finish or cancel the current meal before archiving this Lunch Loop'; end if;
      deletion_time := now() + interval '30 days';
      update public.groups set status = 'archived', archived_at = now(), archived_by = auth.uid(), delete_scheduled_for = deletion_time where id = target_group;
      update public.profiles set active_group_id = (
        select member.group_id from public.group_members member join public.groups group_record on group_record.id = member.group_id
        where member.user_id = auth.uid() and member.group_id <> target_group and group_record.status = 'active'
        order by group_record.created_at desc limit 1
      ) where id = auth.uid() and active_group_id = target_group;
      return deletion_time;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.restore_archived_lunch_loop(target_group uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and role = 'owner') then raise exception 'Only this Lunch Loop''s owner can restore it'; end if;
      if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= 2 then raise exception 'An account can own up to two active Lunch Loops'; end if;
      update public.groups set status = 'active', archived_at = null, archived_by = null, delete_scheduled_for = null where id = target_group and status = 'archived';
      if not found then raise exception 'That archived Lunch Loop is not available'; end if;
      update public.profiles set active_group_id = target_group where id = auth.uid();
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.permanently_delete_lunch_loop(target_group uuid)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and role = 'owner') then raise exception 'Only this Lunch Loop''s owner can permanently delete it'; end if;
      if not exists(select 1 from public.groups where id = target_group and status = 'archived' and delete_scheduled_for <= now()) then raise exception 'This Lunch Loop is still in its 30-day recovery window'; end if;
      delete from public.groups where id = target_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.export_lunch_loop_data(target_group uuid)
    returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and role = 'owner') then raise exception 'Only this Lunch Loop''s owner can export it'; end if;
      return jsonb_build_object(
        'exported_at', now(),
        'group', (select to_jsonb(group_record) - 'invite_code' from public.groups group_record where group_record.id = target_group),
        'members', (select coalesce(jsonb_agg(to_jsonb(member) order by member.rotation_order), '[]'::jsonb) from public.group_members member where member.group_id = target_group),
        'restaurants', (select coalesce(jsonb_agg(to_jsonb(restaurant) order by restaurant.created_at), '[]'::jsonb) from public.restaurants restaurant where restaurant.group_id = target_group),
        'sessions', (select coalesce(jsonb_agg(to_jsonb(session) order by session.started_at), '[]'::jsonb) from public.lunch_sessions session where session.group_id = target_group)
      );
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.create_lunch_group(group_name text, display_name text)
    returns uuid language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare new_group uuid;
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      perform public.enforce_user_rate_limit('create_group', 3, interval '1 hour');
      if not coalesce((select allow_new_groups from public.site_settings where singleton), true) and not public.is_site_admin() then raise exception 'New lunch groups are not available right now'; end if;
      if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = auth.uid() and member.role = 'owner' and group_record.status = 'active') >= 2 then raise exception 'An account can own up to two active Lunch Loops'; end if;
      perform public.sync_lunch_profile(display_name);
      insert into public.groups(name) values (trim(group_name)) returning id into new_group;
      insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
      update public.profiles set active_group_id = new_group where id = auth.uid();
      return new_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.global_admin_update_member_invite_limit(new_limit integer default null)
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      if new_limit is not null and new_limit not between 1 and 1000 then raise exception 'Set a daily invite limit between 1 and 1,000, or leave it blank for no limit'; end if;
      update public.site_settings set member_invite_limit_per_day = new_limit, updated_at = now(), updated_by = auth.uid() where singleton;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.global_admin_create_lunch_group_for_request(
      target_user uuid,
      new_group_name text
    )
    returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare new_group uuid;
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters'; end if;
      if not exists(select 1 from public.lunch_loop_invite_requests where user_id = target_user and status in ('new', 'reviewed', 'invited')) then raise exception 'Create a crew only for an active invite request'; end if;
      if (select count(*) from public.group_members member join public.groups group_record on group_record.id = member.group_id where member.user_id = target_user and member.role = 'owner' and group_record.status = 'active') >= 2 then raise exception 'This account already owns two active Lunch Loops'; end if;
      insert into public.groups(name) values (trim(new_group_name)) returning id into new_group;
      insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, target_user, 'owner', 0);
      update public.profiles set active_group_id = new_group where id = target_user;
      update public.lunch_loop_invite_requests set status = 'invited', reviewed_at = now(), reviewed_by = auth.uid() where user_id = target_user;
      return jsonb_build_object('group_id', new_group);
    end;
    $body$
  $function$;

  -- Retire the permanent, group-wide password. New owner-issued invitations
  -- are single-use, expiring, and tied to the recipient's verified account.
  execute $function$
    create or replace function public.join_lunch_group(group_invite_code text, display_name text)
    returns uuid language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin raise exception 'Ask the Lunch Loop owner for a one-time invitation link or short code'; end;
    $body$
  $function$;

  execute 'revoke all on table public.group_member_invitations, public.loop_creation_invitations, public.lunch_loop_feedback from public, anon, authenticated';
  execute 'revoke all on function public.get_my_lunch_loops(), public.set_active_lunch_loop(uuid), public.create_group_member_invitation(uuid, text), public.get_group_member_invitations(uuid), public.revoke_group_member_invitation(uuid), public.redeem_group_member_invitation(text, text, text), public.create_loop_creation_invitation(uuid, text), public.redeem_loop_creation_invitation(text, text, text), public.get_group_creation_invitations(uuid), public.submit_lunch_loop_feedback(text, text, text, text, text), public.get_my_lunch_loop_feedback(), public.get_site_lunch_loop_feedback(), public.update_site_lunch_loop_feedback(uuid, text, text, text, uuid), public.transfer_lunch_loop_ownership(uuid, uuid), public.archive_lunch_loop(uuid), public.restore_archived_lunch_loop(uuid), public.permanently_delete_lunch_loop(uuid), public.export_lunch_loop_data(uuid), public.ensure_lunch_loop_invite_limit(uuid), public.global_admin_create_lunch_group_for_request(uuid, text), public.global_admin_update_member_invite_limit(integer) from public, anon, authenticated';
  execute 'grant execute on function public.get_my_lunch_loops(), public.set_active_lunch_loop(uuid), public.create_group_member_invitation(uuid, text), public.get_group_member_invitations(uuid), public.revoke_group_member_invitation(uuid), public.redeem_group_member_invitation(text, text, text), public.create_loop_creation_invitation(uuid, text), public.redeem_loop_creation_invitation(text, text, text), public.get_group_creation_invitations(uuid), public.submit_lunch_loop_feedback(text, text, text, text, text), public.get_my_lunch_loop_feedback(), public.get_site_lunch_loop_feedback(), public.update_site_lunch_loop_feedback(uuid, text, text, text, uuid), public.transfer_lunch_loop_ownership(uuid, uuid), public.archive_lunch_loop(uuid), public.restore_archived_lunch_loop(uuid), public.permanently_delete_lunch_loop(uuid), public.export_lunch_loop_data(uuid), public.global_admin_create_lunch_group_for_request(uuid, text), public.global_admin_update_member_invite_limit(integer) to authenticated';
end;
$migration$;
