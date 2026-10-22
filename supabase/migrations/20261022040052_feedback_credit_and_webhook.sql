-- Optional public credit on feedback, plus a non-blocking maintainer alert.
-- The alert URL and bearer key live in Supabase Vault. This migration does not
-- store either value. If a secret is missing, or the site switch is off, the
-- insert still succeeds and notified_at stays empty.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

alter table public.lunch_loop_feedback
  add column if not exists credit_opt_in boolean not null default false,
  add column if not exists credit_name text,
  add column if not exists notified_at timestamptz;

alter table public.lunch_loop_feedback
  drop constraint if exists lunch_loop_feedback_credit_name_length;
alter table public.lunch_loop_feedback
  add constraint lunch_loop_feedback_credit_name_length
  check (credit_name is null or char_length(trim(credit_name)) between 1 and 60);

alter table public.lunch_loop_feedback
  drop constraint if exists lunch_loop_feedback_credit_opt_in_name;
alter table public.lunch_loop_feedback
  add constraint lunch_loop_feedback_credit_opt_in_name
  check (
    credit_opt_in = false
    or char_length(trim(coalesce(credit_name, ''))) between 1 and 60
  );

alter table public.site_settings
  add column if not exists feedback_webhook_enabled boolean not null default true;

create or replace function public.global_admin_set_feedback_webhook_enabled(new_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;
  update public.site_settings
  set feedback_webhook_enabled = new_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  where singleton;
end;
$body$;

drop function if exists public.submit_lunch_loop_feedback(text, text, text, text, text);
create function public.submit_lunch_loop_feedback(
  new_kind text,
  new_title text,
  new_details text,
  new_page_path text default null,
  new_build text default null,
  new_credit_opt_in boolean default false,
  new_credit_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  feedback_id uuid;
  context_group uuid;
  opted_in boolean := coalesce(new_credit_opt_in, false);
  cleaned_credit_name text := nullif(trim(coalesce(new_credit_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in before sending feedback'; end if;
  if new_kind not in ('bug', 'feature', 'question', 'other') then raise exception 'Choose a feedback type'; end if;
  if char_length(trim(coalesce(new_title, ''))) not between 3 and 140 then raise exception 'Give feedback a short title between 3 and 140 characters'; end if;
  if char_length(trim(coalesce(new_details, ''))) not between 10 and 5000 then raise exception 'Add at least a little more detail so we can act on it'; end if;
  if opted_in and (cleaned_credit_name is null or char_length(cleaned_credit_name) not between 1 and 60) then
    raise exception 'Add a credit name between 1 and 60 characters, or leave credit unchecked';
  end if;
  if not opted_in then
    cleaned_credit_name := null;
  end if;
  select active_group_id into context_group from public.profiles where id = auth.uid();
  insert into public.lunch_loop_feedback(
    user_id, group_id, kind, title, details, page_path, build, credit_opt_in, credit_name
  )
  values (
    auth.uid(),
    context_group,
    new_kind,
    trim(new_title),
    trim(new_details),
    nullif(left(trim(coalesce(new_page_path, '')), 500), ''),
    nullif(left(trim(coalesce(new_build, '')), 80), ''),
    opted_in,
    cleaned_credit_name
  )
  returning id into feedback_id;
  return feedback_id;
end;
$body$;

drop function if exists public.get_my_lunch_loop_feedback();
create function public.get_my_lunch_loop_feedback()
returns table(
  id uuid,
  kind text,
  title text,
  status text,
  priority text,
  reporter_note text,
  created_at timestamptz,
  updated_at timestamptz,
  credit_opt_in boolean,
  credit_name text
)
language sql
security definer
set search_path = public, pg_catalog
as $body$
  select feedback.id, feedback.kind, feedback.title, feedback.status,
    feedback.priority, feedback.reporter_note, feedback.created_at,
    feedback.updated_at, feedback.credit_opt_in, feedback.credit_name
  from public.lunch_loop_feedback feedback
  where feedback.user_id = auth.uid()
  order by feedback.created_at desc
$body$;

create or replace function public.update_my_lunch_loop_feedback_credit(
  target_feedback uuid,
  new_credit_opt_in boolean,
  new_credit_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  opted_in boolean := coalesce(new_credit_opt_in, false);
  cleaned_credit_name text := nullif(trim(coalesce(new_credit_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in before updating feedback'; end if;
  if opted_in and (cleaned_credit_name is null or char_length(cleaned_credit_name) not between 1 and 60) then
    raise exception 'Add a credit name between 1 and 60 characters, or leave credit unchecked';
  end if;
  if not opted_in then
    cleaned_credit_name := null;
  end if;
  update public.lunch_loop_feedback
  set credit_opt_in = opted_in,
      credit_name = cleaned_credit_name
  where id = target_feedback
    and user_id = auth.uid();
  if not found then
    raise exception 'That feedback note was not found';
  end if;
end;
$body$;

drop function if exists public.get_site_lunch_loop_feedback();
create function public.get_site_lunch_loop_feedback()
returns table(
  id uuid,
  user_id uuid,
  display_name text,
  account_email text,
  group_name text,
  kind text,
  title text,
  details text,
  page_path text,
  build text,
  status text,
  priority text,
  admin_note text,
  reporter_note text,
  duplicate_of uuid,
  created_at timestamptz,
  updated_at timestamptz,
  credit_opt_in boolean,
  credit_name text,
  notified_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;

  return query
  select feedback.id, feedback.user_id, profile.display_name, identity.email,
    group_record.name, feedback.kind, feedback.title, feedback.details,
    feedback.page_path, feedback.build, feedback.status, feedback.priority,
    feedback.admin_note, feedback.reporter_note, feedback.duplicate_of,
    feedback.created_at, feedback.updated_at, feedback.credit_opt_in,
    feedback.credit_name, feedback.notified_at
  from public.lunch_loop_feedback feedback
  join public.profiles profile on profile.id = feedback.user_id
  left join public.user_account_identities identity on identity.user_id = feedback.user_id
  left join public.groups group_record on group_record.id = feedback.group_id
  order by case feedback.status
    when 'new' then 0
    when 'triaged' then 1
    when 'planned' then 2
    when 'in_progress' then 3
    else 4
  end,
    case feedback.priority
      when 'urgent' then 0
      when 'high' then 1
      when 'normal' then 2
      else 3
    end,
    feedback.created_at desc;
end;
$body$;

create or replace function public.notify_lunch_loop_feedback_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net, extensions, pg_catalog
as $body$
declare
  alerts_enabled boolean;
  webhook_url text;
  webhook_key text;
  reporter_name text;
begin
  select setting.feedback_webhook_enabled
  into alerts_enabled
  from public.site_settings setting
  where setting.singleton;
  if not coalesce(alerts_enabled, true) then
    return new;
  end if;

  begin
    select secret.decrypted_secret
    into webhook_url
    from vault.decrypted_secrets secret
    where secret.name = 'lunchloop_feedback_webhook_url'
    order by secret.created_at desc
    limit 1;

    select secret.decrypted_secret
    into webhook_key
    from vault.decrypted_secrets secret
    where secret.name = 'lunchloop_feedback_webhook_key'
    order by secret.created_at desc
    limit 1;
  exception when others then
    raise warning 'Lunch Loop feedback webhook skipped: vault secrets are unavailable (%).', sqlerrm;
    return new;
  end;

  if nullif(btrim(coalesce(webhook_url, '')), '') is null
     or nullif(btrim(coalesce(webhook_key, '')), '') is null then
    return new;
  end if;
  if btrim(webhook_url) !~ '^https://' then
    raise warning 'Lunch Loop feedback webhook skipped: the URL secret must start with https://.';
    return new;
  end if;

  select profile.display_name
  into reporter_name
  from public.profiles profile
  where profile.id = new.user_id;

  begin
    perform net.http_post(
      url := btrim(webhook_url),
      body := jsonb_build_object(
        'id', new.id,
        'kind', new.kind,
        'title', new.title,
        'details', new.details,
        'page', new.page_path,
        'build', new.build,
        'created_at', new.created_at,
        'reporter_display_name', coalesce(reporter_name, 'Lunch friend'),
        'credit_opt_in', new.credit_opt_in,
        'credit_name', case when new.credit_opt_in then new.credit_name else null end,
        'admin_link', 'https://lunchloop.app/global-admin'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || btrim(webhook_key)
      ),
      timeout_milliseconds := 5000
    );
    update public.lunch_loop_feedback
    set notified_at = now()
    where id = new.id;
  exception when others then
    raise warning 'Lunch Loop feedback webhook skipped: the alert could not be queued (%).', sqlerrm;
    return new;
  end;
  return new;
end;
$body$;

drop trigger if exists lunch_loop_feedback_notify_webhook on public.lunch_loop_feedback;
create trigger lunch_loop_feedback_notify_webhook
  after insert on public.lunch_loop_feedback
  for each row
  execute function public.notify_lunch_loop_feedback_webhook();

revoke all on function public.submit_lunch_loop_feedback(text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.get_my_lunch_loop_feedback() from public, anon, authenticated;
revoke all on function public.update_my_lunch_loop_feedback_credit(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.get_site_lunch_loop_feedback() from public, anon, authenticated;
revoke all on function public.global_admin_set_feedback_webhook_enabled(boolean) from public, anon, authenticated;
revoke all on function public.notify_lunch_loop_feedback_webhook() from public, anon, authenticated;

grant execute on function public.submit_lunch_loop_feedback(text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.get_my_lunch_loop_feedback() to authenticated;
grant execute on function public.update_my_lunch_loop_feedback_credit(uuid, boolean, text) to authenticated;
grant execute on function public.get_site_lunch_loop_feedback() to authenticated;
grant execute on function public.global_admin_set_feedback_webhook_enabled(boolean) to authenticated;

notify pgrst, 'reload schema';
