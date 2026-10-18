-- Add scheduled meal details to Discord and let owners opt into schedule-change notices.
do $migration$
begin
  execute $function$
    create or replace function public.discord_events_are_valid(events text[])
    returns boolean language sql immutable set search_path = public
    as $body$
      select coalesce(array_length(events, 1), 0) > 0
        and not exists(
          select 1 from unnest(events) as event_name
          where event_name not in ('picks_ready', 'veto_made', 'decision_made', 'next_turn', 'schedule_changed')
        )
    $body$
  $function$;

  execute $sql$
    update public.group_discord_notifications
    set enabled_events = array(
      select distinct event_name
      from unnest(enabled_events || array['schedule_changed']::text[]) as event_name
      order by event_name
    )
    where not ('schedule_changed' = any(enabled_events))
  $sql$;

  execute $function$
    create or replace function public.discord_scheduled_time(scheduled_at timestamptz)
    returns text language sql stable set search_path = public
    as $body$
      select to_char(timezone('America/Chicago', scheduled_at), 'FMDay, Mon FMDD, YYYY "at" FMHH12:MI AM')
    $body$
  $function$;

  execute $function$
    create or replace function public.notify_discord_on_lunch_session()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare group_name text; suggester_name text; winner_name text; next_picker text; meal_name text; scheduled_label text;
    begin
      scheduled_label := public.discord_scheduled_time(new.scheduled_for);
      if tg_op = 'INSERT' and new.status = 'active' then
        select lunch_group.name, profile.display_name, public.discord_meal_name(new.scheduled_for)
        into group_name, suggester_name, meal_name
        from public.groups lunch_group join public.profiles profile on profile.id = new.suggester_id
        where lunch_group.id = new.group_id;
        perform public.send_group_discord_notification(new.group_id, 'picks_ready', '🎲 The picks are ready', format('**%s** made the %s selection for **%s**. Planned for **%s**. The crew can veto now.', suggester_name, meal_name, group_name, scheduled_label));
      elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'chosen' then
        select lunch_group.name, restaurant.name, public.discord_meal_name(new.scheduled_for)
        into group_name, winner_name, meal_name
        from public.groups lunch_group join public.restaurants restaurant on restaurant.id = new.final_restaurant_id
        where lunch_group.id = new.group_id;
        perform public.send_group_discord_notification(new.group_id, 'decision_made', '🏆 Decision made', format('**%s** wins %s for **%s**! Planned for **%s**.', winner_name, meal_name, group_name, scheduled_label));
      elsif tg_op = 'UPDATE' and old.scheduled_for is distinct from new.scheduled_for then
        select name into group_name from public.groups where id = new.group_id;
        perform public.send_group_discord_notification(new.group_id, 'schedule_changed', '🗓️ Meal time updated', format('The %s time for **%s** is now **%s**.', public.discord_meal_name(new.scheduled_for), group_name, scheduled_label));
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
    $body$
  $function$;

  execute 'drop trigger if exists discord_notify_lunch_session on public.lunch_sessions';
  execute 'create trigger discord_notify_lunch_session after insert or update of status, scheduled_for on public.lunch_sessions for each row execute function public.notify_discord_on_lunch_session()';
end;
$migration$;
