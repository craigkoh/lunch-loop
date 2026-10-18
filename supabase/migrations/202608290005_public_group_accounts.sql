-- Keep account identity data private while giving group owners a useful crew directory.
-- Every group remains isolated by group_id; this adds safer account-aware membership management.
do $migration$
begin
  execute $sql$
    create table if not exists public.user_account_identities (
      user_id uuid primary key references public.profiles(id) on delete cascade,
      email text,
      provider text,
      avatar_url text,
      last_synced_at timestamptz not null default now()
    )
  $sql$;
  execute 'alter table public.user_account_identities enable row level security';
  execute $sql$
    insert into public.user_account_identities(user_id, email, provider, avatar_url, last_synced_at)
    select account.id,
      nullif(lower(account.email), ''),
      coalesce(account.raw_app_meta_data ->> 'provider', 'email'),
      coalesce(account.raw_user_meta_data ->> 'avatar_url', account.raw_user_meta_data ->> 'picture'),
      now()
    from auth.users account
    join public.profiles profile on profile.id = account.id
    on conflict (user_id) do update set
      email = excluded.email,
      provider = excluded.provider,
      avatar_url = excluded.avatar_url,
      last_synced_at = now()
  $sql$;

  execute $function$
    create or replace function public.sync_lunch_profile(new_display_name text default null)
    returns void language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
    declare account auth.users%rowtype; safe_name text;
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      select * into account from auth.users where id = auth.uid();
      safe_name := nullif(trim(coalesce(new_display_name, '')), '');
      if safe_name is not null and char_length(safe_name) not between 1 and 50 then raise exception 'Display name must be between 1 and 50 characters'; end if;
      insert into public.profiles(id, display_name)
      values (auth.uid(), coalesce(safe_name, nullif(trim(coalesce(account.raw_user_meta_data ->> 'full_name', account.raw_user_meta_data ->> 'name', '')), ''), 'Lunch friend'))
      on conflict (id) do update set display_name = coalesce(safe_name, public.profiles.display_name);
      insert into public.user_account_identities(user_id, email, provider, avatar_url, last_synced_at)
      values (auth.uid(), nullif(lower(account.email), ''), coalesce(account.raw_app_meta_data ->> 'provider', 'email'), coalesce(account.raw_user_meta_data ->> 'avatar_url', account.raw_user_meta_data ->> 'picture'), now())
      on conflict (user_id) do update set email = excluded.email, provider = excluded.provider, avatar_url = excluded.avatar_url, last_synced_at = now();
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.sync_my_lunch_profile()
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      perform public.sync_lunch_profile(null);
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.create_lunch_group(group_name text, display_name text)
    returns uuid language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare new_group uuid;
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      if char_length(trim(coalesce(group_name, ''))) not between 1 and 80 then raise exception 'Group name must be between 1 and 80 characters'; end if;
      perform public.enforce_user_rate_limit('create_group', 3, interval '1 hour');
      if not coalesce((select allow_new_groups from public.site_settings where singleton), true) and not public.is_site_admin() then raise exception 'New lunch groups are not available right now'; end if;
      perform public.sync_lunch_profile(display_name);
      insert into public.groups(name) values (trim(group_name)) returning id into new_group;
      insert into public.group_members(group_id, user_id, role, rotation_order) values (new_group, auth.uid(), 'owner', 0);
      return new_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.join_lunch_group(group_invite_code text, display_name text)
    returns uuid language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare target_group uuid; next_order smallint;
    begin
      if auth.uid() is null then raise exception 'You must be signed in'; end if;
      perform public.enforce_user_rate_limit('join_group', 12, interval '15 minutes');
      select id into target_group from public.groups where invite_code = upper(trim(group_invite_code)) and status = 'active' for update;
      if target_group is null then raise exception 'That invite code was not found or the lunch group is unavailable'; end if;
      if (select count(*) from public.group_members where group_id = target_group) >= 6
        and not exists(select 1 from public.group_members where group_id = target_group and user_id = auth.uid()) then
        raise exception 'This lunch group already has its six members';
      end if;
      perform public.sync_lunch_profile(display_name);
      select coalesce(max(rotation_order) + 1, 0) into next_order from public.group_members where group_id = target_group;
      insert into public.group_members(group_id, user_id, rotation_order) values (target_group, auth.uid(), next_order) on conflict (group_id, user_id) do nothing;
      return target_group;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_group_member_directory(target_group uuid)
    returns table(user_id uuid, rotation_order smallint, role text, display_name text, joined_at timestamptz, account_email text, auth_provider text, avatar_url text)
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare can_view_accounts boolean;
    begin
      if not public.is_group_member(target_group) then raise exception 'This lunch group is not available'; end if;
      can_view_accounts := public.is_group_owner(target_group) or public.is_site_admin();
      return query
      select member.user_id, member.rotation_order, member.role, profile.display_name, member.joined_at,
        case when can_view_accounts or member.user_id = auth.uid() then identity.email else null end,
        case when can_view_accounts or member.user_id = auth.uid() then identity.provider else null end,
        case when can_view_accounts or member.user_id = auth.uid() then identity.avatar_url else null end
      from public.group_members member
      join public.profiles profile on profile.id = member.user_id
      left join public.user_account_identities identity on identity.user_id = member.user_id
      where member.group_id = target_group
      order by member.rotation_order;
    end;
    $body$
  $function$;

  execute 'revoke all on table public.user_account_identities from public, anon, authenticated';
  execute 'revoke execute on function public.sync_lunch_profile(text) from public, anon, authenticated';
  execute 'revoke execute on function public.sync_my_lunch_profile(), public.get_group_member_directory(uuid) from public, anon';
  execute 'grant execute on function public.sync_my_lunch_profile(), public.get_group_member_directory(uuid) to authenticated';
end;
$migration$;
