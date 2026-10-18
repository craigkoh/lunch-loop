-- Invite-only early access. A person signs in with Google before requesting
-- access, so the queue contains a verified Lunch Loop account instead of a
-- public email form that can be easily spammed.
-- This single DO block can run through the linked database query command.

do $migration$
begin
  execute $sql$
    create table if not exists public.lunch_loop_invite_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique references public.profiles(id) on delete cascade,
      note text,
      status text not null default 'new' check (status in ('new', 'reviewed', 'invited', 'declined', 'spam')),
      requested_at timestamptz not null default now(),
      reviewed_at timestamptz,
      reviewed_by uuid references public.profiles(id) on delete set null,
      review_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint lunch_loop_invite_request_note_length check (char_length(coalesce(note, '')) <= 500),
      constraint lunch_loop_invite_request_review_note_length check (char_length(coalesce(review_note, '')) <= 500)
    )
  $sql$;
  execute 'alter table public.lunch_loop_invite_requests enable row level security';

  execute $function$
    create or replace function public.touch_lunch_loop_invite_request_updated_at()
    returns trigger language plpgsql set search_path = public, pg_catalog as $body$
    begin
      new.updated_at = now();
      return new;
    end;
    $body$
  $function$;
  execute 'drop trigger if exists lunch_loop_invite_requests_touch_updated_at on public.lunch_loop_invite_requests';
  execute 'create trigger lunch_loop_invite_requests_touch_updated_at before update on public.lunch_loop_invite_requests for each row execute function public.touch_lunch_loop_invite_request_updated_at()';

  execute $function$
    create or replace function public.request_lunch_loop_invite(request_note text default null)
    returns void language plpgsql security definer set search_path = public, auth, pg_catalog as $body$
    declare existing_request public.lunch_loop_invite_requests%rowtype;
    begin
      if auth.uid() is null then raise exception 'Sign in with Google before requesting an invite'; end if;
      if char_length(trim(coalesce(request_note, ''))) > 500 then
        raise exception 'Keep your note to 500 characters or fewer';
      end if;
      perform public.sync_my_lunch_profile();
      select * into existing_request
      from public.lunch_loop_invite_requests
      where user_id = auth.uid()
      for update;
      if found then
        if existing_request.status in ('new', 'reviewed', 'invited', 'spam') then return; end if;
        if existing_request.requested_at > now() - interval '30 days' then
          raise exception 'You can request another review in 30 days';
        end if;
        update public.lunch_loop_invite_requests
        set status = 'new',
            note = nullif(trim(request_note), ''),
            requested_at = now(),
            reviewed_at = null,
            reviewed_by = null,
            review_note = null
        where id = existing_request.id;
        return;
      end if;
      insert into public.lunch_loop_invite_requests(user_id, note)
      values (auth.uid(), nullif(trim(request_note), ''));
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.get_my_lunch_loop_invite_request()
    returns table(status text, requested_at timestamptz, review_note text)
    language sql security definer set search_path = public, auth, pg_catalog as $body$
      select request.status, request.requested_at, request.review_note
      from public.lunch_loop_invite_requests request
      where request.user_id = auth.uid()
    $body$
  $function$;

  execute $function$
    create or replace function public.get_site_lunch_loop_invite_requests()
    returns table(
      id uuid,
      user_id uuid,
      display_name text,
      account_email text,
      auth_provider text,
      note text,
      status text,
      requested_at timestamptz,
      reviewed_at timestamptz,
      review_note text
    )
    language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      return query
      select request.id, request.user_id, profile.display_name, identity.email, identity.provider,
        request.note, request.status, request.requested_at, request.reviewed_at, request.review_note
      from public.lunch_loop_invite_requests request
      join public.profiles profile on profile.id = request.user_id
      left join public.user_account_identities identity on identity.user_id = request.user_id
      order by
        case request.status
          when 'new' then 0 when 'reviewed' then 1 when 'invited' then 2
          when 'declined' then 3 else 4
        end,
        request.requested_at desc;
    end;
    $body$
  $function$;

  execute $function$
    create or replace function public.global_admin_update_lunch_loop_invite_request(
      target_request uuid,
      new_status text,
      new_review_note text default null
    )
    returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
    begin
      if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
      if new_status not in ('new', 'reviewed', 'invited', 'declined', 'spam') then
        raise exception 'Choose a valid invite-request status';
      end if;
      if char_length(trim(coalesce(new_review_note, ''))) > 500 then
        raise exception 'Keep the review note to 500 characters or fewer';
      end if;
      update public.lunch_loop_invite_requests
      set status = new_status,
          review_note = nullif(trim(new_review_note), ''),
          reviewed_at = case when new_status = 'new' then null else now() end,
          reviewed_by = case when new_status = 'new' then null else auth.uid() end
      where id = target_request;
      if not found then raise exception 'Invite request was not found'; end if;
    end;
    $body$
  $function$;

  execute 'revoke all on table public.lunch_loop_invite_requests from public, anon, authenticated';
  execute 'revoke all on function public.request_lunch_loop_invite(text) from public';
  execute 'revoke all on function public.get_my_lunch_loop_invite_request() from public';
  execute 'revoke all on function public.get_site_lunch_loop_invite_requests() from public';
  execute 'revoke all on function public.global_admin_update_lunch_loop_invite_request(uuid, text, text) from public';
  execute 'grant execute on function public.request_lunch_loop_invite(text), public.get_my_lunch_loop_invite_request() to authenticated';
  execute 'grant execute on function public.get_site_lunch_loop_invite_requests(), public.global_admin_update_lunch_loop_invite_request(uuid, text, text) to authenticated';

  -- The landing page and private setup flow now explicitly describe invite-only
  -- access. Site administrators remain able to create groups if needed.
  execute 'update public.site_settings set allow_new_groups = false, updated_at = now() where singleton';
end;
$migration$;
