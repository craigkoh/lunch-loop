begin;

alter table public.lunch_loop_feedback
  add column if not exists reporter_note text;

do $body$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lunch_loop_feedback_reporter_note_length'
      and conrelid = 'public.lunch_loop_feedback'::regclass
  ) then
    alter table public.lunch_loop_feedback
      add constraint lunch_loop_feedback_reporter_note_length
      check (char_length(trim(coalesce(reporter_note, ''))) <= 2000);
  end if;
end
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
  updated_at timestamptz
)
language sql security definer set search_path = public, pg_catalog as $body$
  select feedback.id, feedback.kind, feedback.title, feedback.status,
    feedback.priority, feedback.reporter_note, feedback.created_at,
    feedback.updated_at
  from public.lunch_loop_feedback feedback
  where feedback.user_id = auth.uid()
  order by feedback.created_at desc
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
  updated_at timestamptz
)
language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;

  return query
  select feedback.id, feedback.user_id, profile.display_name, identity.email,
    group_record.name, feedback.kind, feedback.title, feedback.details,
    feedback.page_path, feedback.build, feedback.status, feedback.priority,
    feedback.admin_note, feedback.reporter_note, feedback.duplicate_of,
    feedback.created_at, feedback.updated_at
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

drop function if exists public.update_site_lunch_loop_feedback(uuid, text, text, text, uuid);
create function public.update_site_lunch_loop_feedback(
  target_feedback uuid,
  new_status text,
  new_priority text,
  new_admin_note text default null,
  new_duplicate_of uuid default null,
  new_reporter_note text default null
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_site_admin() then
    raise exception 'Global administrator access is required';
  end if;
  if new_status not in ('new', 'triaged', 'planned', 'in_progress', 'shipped', 'declined', 'duplicate') then
    raise exception 'Choose a valid feedback status';
  end if;
  if new_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Choose a valid priority';
  end if;
  if char_length(trim(coalesce(new_admin_note, ''))) > 2000 then
    raise exception 'Keep the internal note to 2,000 characters or fewer';
  end if;
  if char_length(trim(coalesce(new_reporter_note, ''))) > 2000 then
    raise exception 'Keep the reporter update to 2,000 characters or fewer';
  end if;
  if new_status = 'shipped' and nullif(trim(coalesce(new_reporter_note, '')), '') is null then
    raise exception 'Add a reporter-facing update before marking feedback shipped';
  end if;

  update public.lunch_loop_feedback
  set status = new_status,
    priority = new_priority,
    admin_note = nullif(trim(new_admin_note), ''),
    reporter_note = nullif(trim(new_reporter_note), ''),
    duplicate_of = new_duplicate_of
  where id = target_feedback;
  if not found then
    raise exception 'Feedback item was not found';
  end if;
end;
$body$;

revoke all on function public.get_my_lunch_loop_feedback(), public.get_site_lunch_loop_feedback(), public.update_site_lunch_loop_feedback(uuid, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.get_my_lunch_loop_feedback(), public.get_site_lunch_loop_feedback(), public.update_site_lunch_loop_feedback(uuid, text, text, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
