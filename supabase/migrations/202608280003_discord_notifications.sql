create extension if not exists pg_net with schema extensions;

create table public.group_discord_notifications (
  group_id uuid primary key references public.groups(id) on delete cascade,
  webhook_url text not null check (webhook_url ~ '^https://(canary\.|ptb\.)?discord(app)?\.com/api/webhooks/'),
  enabled boolean not null default true,
  enabled_events text[] not null default array['picks_ready', 'veto_made', 'decision_made', 'next_turn']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.group_discord_notifications enable row level security;

create or replace function public.discord_events_are_valid(events text[])
returns boolean language sql immutable set search_path = public
as $$
  select coalesce(array_length(events, 1), 0) > 0
    and not exists(
      select 1 from unnest(events) as event_name
      where event_name not in ('picks_ready', 'veto_made', 'decision_made', 'next_turn')
    )
$$;

alter table public.group_discord_notifications drop constraint if exists group_discord_notifications_enabled_events_check;
alter table public.group_discord_notifications add constraint group_discord_notifications_enabled_events_check check (public.discord_events_are_valid(enabled_events));

create or replace function public.get_group_discord_notification_settings(target_group uuid)
returns table(enabled boolean, webhook_configured boolean, enabled_events text[])
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(target_group) then raise exception 'Only the group owner can view Discord notification settings'; end if;
  return query
  select coalesce(config.enabled, false), config.group_id is not null, coalesce(config.enabled_events, '{}'::text[])
  from (select target_group as group_id) requested
  left join public.group_discord_notifications config on config.group_id = requested.group_id;
end;
$$;

create or replace function public.save_group_discord_notification_settings(
  target_group uuid,
  new_webhook_url text,
  new_enabled boolean,
  new_enabled_events text[]
)
returns void language plpgsql security definer set search_path = public as $$
declare cleaned_url text := nullif(trim(coalesce(new_webhook_url, '')), '');
begin
  if not public.is_group_owner(target_group) then raise exception 'Only the group owner can manage Discord notifications'; end if;
  if not public.discord_events_are_valid(new_enabled_events) then raise exception 'Choose at least one valid Discord notification type'; end if;
  if cleaned_url is not null and cleaned_url !~ '^https://(canary\.|ptb\.)?discord(app)?\.com/api/webhooks/' then
    raise exception 'Enter a Discord webhook URL that starts with https://discord.com/api/webhooks/';
  end if;
  if cleaned_url is null and not exists(select 1 from public.group_discord_notifications where group_id = target_group) then
    raise exception 'Paste a Discord webhook URL before saving notifications';
  end if;
  insert into public.group_discord_notifications(group_id, webhook_url, enabled, enabled_events, updated_at, updated_by)
  values (target_group, cleaned_url, new_enabled, (select array_agg(distinct event_name order by event_name) from unnest(new_enabled_events) as event_name), now(), auth.uid())
  on conflict (group_id) do update set
    webhook_url = coalesce(excluded.webhook_url, group_discord_notifications.webhook_url),
    enabled = excluded.enabled,
    enabled_events = excluded.enabled_events,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

create or replace function public.remove_group_discord_notification_settings(target_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(target_group) then raise exception 'Only the group owner can manage Discord notifications'; end if;
  delete from public.group_discord_notifications where group_id = target_group;
end;
$$;

create or replace function public.send_group_discord_notification(
  target_group uuid,
  event_name text,
  title text,
  description text,
  force_send boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare config public.group_discord_notifications%rowtype;
begin
  select * into config from public.group_discord_notifications where group_id = target_group and enabled;
  if config.group_id is null or (not force_send and not event_name = any(config.enabled_events)) then return; end if;
  perform net.http_post(
    url := config.webhook_url,
    body := jsonb_build_object('username', 'Lunch Loop', 'embeds', jsonb_build_array(jsonb_build_object('title', title, 'description', description, 'color', 16744448))),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.send_test_group_discord_notification(target_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(target_group) then raise exception 'Only the group owner can test Discord notifications'; end if;
  perform public.send_group_discord_notification(target_group, 'test', 'Lunch Loop is connected', 'This is a test message from your Lunch Loop notifications. 🎉', true);
end;
$$;

create or replace function public.discord_meal_name(scheduled_at timestamptz)
returns text language sql stable set search_path = public
as $$ select case when extract(hour from timezone('America/Chicago', scheduled_at)) >= 16 then 'dinner' else 'lunch' end $$;

create or replace function public.notify_discord_on_lunch_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare group_name text; suggester_name text; winner_name text; next_picker text; meal_name text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    select lunch_group.name, profile.display_name, public.discord_meal_name(new.scheduled_for)
    into group_name, suggester_name, meal_name
    from public.groups lunch_group join public.profiles profile on profile.id = new.suggester_id
    where lunch_group.id = new.group_id;
    perform public.send_group_discord_notification(new.group_id, 'picks_ready', '🎲 The picks are ready', format('**%s** made the %s selection for **%s**. The crew can veto now.', suggester_name, meal_name, group_name));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'chosen' then
    select lunch_group.name, restaurant.name, public.discord_meal_name(new.scheduled_for)
    into group_name, winner_name, meal_name
    from public.groups lunch_group join public.restaurants restaurant on restaurant.id = new.final_restaurant_id
    where lunch_group.id = new.group_id;
    perform public.send_group_discord_notification(new.group_id, 'decision_made', '🏆 Decision made', format('**%s** wins %s for **%s**!', winner_name, meal_name, group_name));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed' then
    select profile.display_name into next_picker
    from public.group_members member join public.profiles profile on profile.id = member.user_id
    where member.group_id = new.group_id
    order by member.rotation_order
    offset ((select count(*) from public.lunch_sessions where group_id = new.group_id and status = 'completed') % (select count(*) from public.group_members where group_id = new.group_id))
    limit 1;
    select name into group_name from public.groups where id = new.group_id;
    perform public.send_group_discord_notification(new.group_id, 'next_turn', '🔁 A new loop can begin', format('Lunch Loop is ready for the next round in **%s**. **%s**, it is your turn to pick.', group_name, next_picker));
  end if;
  return new;
end;
$$;

create or replace function public.notify_discord_on_veto()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_group uuid; group_name text; voter_name text; restaurant_name text;
begin
  select session.group_id, lunch_group.name, profile.display_name, restaurant.name
  into session_group, group_name, voter_name, restaurant_name
  from public.lunch_sessions session
  join public.groups lunch_group on lunch_group.id = session.group_id
  join public.profiles profile on profile.id = new.user_id
  join public.lunch_session_candidates candidate on candidate.id = new.candidate_id
  join public.restaurants restaurant on restaurant.id = candidate.restaurant_id
  where session.id = new.session_id;
  perform public.send_group_discord_notification(session_group, 'veto_made', '✂️ A veto landed', format('**%s** vetoed **%s** in **%s**.', voter_name, restaurant_name, group_name));
  return new;
end;
$$;

drop trigger if exists discord_notify_lunch_session on public.lunch_sessions;
create trigger discord_notify_lunch_session after insert or update of status on public.lunch_sessions for each row execute function public.notify_discord_on_lunch_session();
drop trigger if exists discord_notify_veto on public.vetoes;
create trigger discord_notify_veto after insert on public.vetoes for each row execute function public.notify_discord_on_veto();

grant execute on function public.get_group_discord_notification_settings(uuid), public.save_group_discord_notification_settings(uuid, text, boolean, text[]), public.remove_group_discord_notification_settings(uuid), public.send_test_group_discord_notification(uuid) to authenticated;
