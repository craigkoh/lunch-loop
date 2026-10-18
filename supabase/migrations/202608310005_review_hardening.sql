-- Production review hardening: enforce business limits at the database
-- boundary, remove accidental anonymous RPC access, and make restaurant facts
-- available in one authorized read.

create or replace function public.enforce_lunch_loop_member_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-member-limit:' || new.group_id::text, 0)
  );

  -- An idempotent invitation redemption may reach this trigger before its
  -- ON CONFLICT clause. It should remain harmless even when the crew is full.
  if tg_op = 'INSERT' and exists (
    select 1
    from public.group_members existing_member
    where existing_member.group_id = new.group_id
      and existing_member.user_id = new.user_id
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' and (
    select count(*)
    from public.group_members member
    where member.group_id = new.group_id
  ) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;

  if new.role = 'owner'
    and (tg_op = 'INSERT' or old.role is distinct from 'owner') then
    perform pg_advisory_xact_lock(
      hashtextextended('lunch-loop-owner-limit:' || new.user_id::text, 0)
    );
    if (
      select count(*)
      from public.group_members member
      join public.groups lunch_group on lunch_group.id = member.group_id
      where member.user_id = new.user_id
        and member.role = 'owner'
        and lunch_group.status = 'active'
        and lunch_group.id <> new.group_id
    ) >= 2 then
      raise exception 'An account can own up to two active Lunch Loops';
    end if;
  end if;

  return new;
end;
$body$;

drop trigger if exists enforce_lunch_loop_member_limits on public.group_members;
create trigger enforce_lunch_loop_member_limits
before insert or update of role on public.group_members
for each row execute function public.enforce_lunch_loop_member_limits();

create or replace function public.redeem_group_member_invitation(
  raw_token text,
  raw_code text default null,
  new_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $body$
declare
  invitation public.group_member_invitations%rowtype;
  account_email text;
  next_order smallint;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a Lunch Loop'; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  update public.group_member_invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  select * into invitation
  from public.group_member_invitations
  where status = 'pending'
    and expires_at > now()
    and (
      (nullif(trim(coalesce(raw_token, '')), '') <> '' and token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex'))
      or
      (nullif(regexp_replace(coalesce(raw_code, ''), '[^A-Za-z0-9]', '', 'g'), '') <> '' and short_code_hash = encode(extensions.digest(upper(regexp_replace(raw_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex'))
    )
  for update;
  if not found then raise exception 'That invitation is unavailable, expired, or already used'; end if;
  if account_email is null or lower(invitation.recipient_email) <> account_email then
    raise exception '%', 'Use the Google account invited at ' || invitation.recipient_email;
  end if;
  if not exists(select 1 from public.groups where id = invitation.group_id and status = 'active') then
    raise exception 'This Lunch Loop is not available';
  end if;

  -- Serialize the capacity check and rotation position for different invite
  -- links accepted at the same time.
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-member-limit:' || invitation.group_id::text, 0)
  );
  if not exists(select 1 from public.group_members where group_id = invitation.group_id and user_id = auth.uid())
    and (select count(*) from public.group_members where group_id = invitation.group_id) >= 6 then
    raise exception 'This Lunch Loop already has its six members';
  end if;

  perform public.sync_lunch_profile(new_display_name);
  select coalesce(max(rotation_order) + 1, 0)
  into next_order
  from public.group_members
  where group_id = invitation.group_id;
  insert into public.group_members(group_id, user_id, rotation_order)
  values (invitation.group_id, auth.uid(), next_order)
  on conflict (group_id, user_id) do nothing;
  perform public.copy_member_restaurants_to_lunch_loop(invitation.group_id, auth.uid());
  update public.group_member_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;
  update public.profiles set active_group_id = invitation.group_id where id = auth.uid();
  return invitation.group_id;
end;
$body$;

create or replace function public.get_restaurant_decision_facts(
  target_restaurant uuid
)
returns table(
  appearances bigint,
  vetoes bigint,
  vetoers bigint
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  restaurant_group uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before viewing restaurant facts';
  end if;

  select restaurant.group_id
  into restaurant_group
  from public.restaurants restaurant
  where restaurant.id = target_restaurant;

  if restaurant_group is null or not public.is_group_member(restaurant_group) then
    raise exception 'That restaurant is not available in this Lunch Loop';
  end if;

  return query
  select
    count(candidate.id)::bigint,
    count(veto.id)::bigint,
    count(distinct veto.user_id)::bigint
  from public.lunch_session_candidates candidate
  join public.lunch_sessions session_record
    on session_record.id = candidate.session_id
  left join public.vetoes veto on veto.candidate_id = candidate.id
  where candidate.restaurant_id = target_restaurant
    and session_record.group_id = restaurant_group;
end;
$body$;

-- Functions created by a migration otherwise inherit PostgreSQL's permissive
-- default EXECUTE grant. Only explicitly granted authenticated RPCs should be
-- callable through the public Supabase API.
revoke execute on all functions in schema public from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Guests never use direct PostgREST table access. RLS remains the defense in
-- depth layer for signed-in members and service-side functions.
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

revoke all on function public.enforce_lunch_loop_member_limits() from public, anon, authenticated;
revoke all on function public.get_restaurant_decision_facts(uuid) from public, anon, authenticated;
grant execute on function public.get_restaurant_decision_facts(uuid) to authenticated;

notify pgrst, 'reload schema';
