-- A direct addition from another Lunch Loop must respect seats already held by
-- pending email/code invitations, just like the invitation-creation paths.
create or replace function public.add_known_lunch_loop_member(
  target_group uuid,
  target_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $body$
declare
  next_order smallint;
  target_name text;
  target_email text;
  group_name text;
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only this Lunch Loop''s owner can add a known member';
  end if;
  if not exists(select 1 from public.groups where id = target_group and status = 'active') then
    raise exception 'This Lunch Loop is not accepting members';
  end if;
  if target_user = auth.uid() then raise exception 'You are already in this Lunch Loop'; end if;
  if not exists(
    select 1
    from public.group_members known_member
    join public.groups source_group on source_group.id = known_member.group_id
    join public.group_members owner_membership
      on owner_membership.group_id = known_member.group_id
      and owner_membership.user_id = auth.uid()
    where known_member.user_id = target_user
      and source_group.status = 'active'
      and known_member.group_id <> target_group
  ) then
    raise exception 'Choose someone who shares one of your other active Lunch Loops';
  end if;
  if exists(select 1 from public.group_members where group_id = target_group and user_id = target_user) then
    raise exception 'This person is already in this Lunch Loop';
  end if;

  -- Use the invitation lock before adding a person so a reserved seat cannot
  -- be silently taken from an email or shareable-code invitation.
  perform pg_advisory_xact_lock(
    hashtextextended('lunch-loop-share-invite:' || target_group::text, 0)
  );
  update public.group_member_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  update public.group_member_share_invitations invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  if (
    (select count(*) from public.group_members where group_id = target_group)
    +
    (select count(*) from public.group_member_invitations invitation
      where invitation.group_id = target_group and invitation.status = 'pending'
        and invitation.expires_at > now())
    +
    (select count(*) from public.group_member_share_invitations invitation
      where invitation.group_id = target_group and invitation.status = 'pending'
        and invitation.expires_at > now())
  ) >= 6 then
    raise exception 'All remaining crew spots are reserved by active invitations. Revoke an unused invite first.';
  end if;

  select coalesce(max(rotation_order) + 1, 0) into next_order
  from public.group_members where group_id = target_group;
  insert into public.group_members(group_id, user_id, role, rotation_order)
  values (target_group, target_user, 'member', next_order);
  perform public.copy_member_restaurants_to_lunch_loop(target_group, target_user);
  insert into public.lunch_loop_member_notifications(user_id, group_id, created_by)
  values (target_user, target_group, auth.uid());
  select profile.display_name, identity.email, lunch_group.name
  into target_name, target_email, group_name
  from public.profiles profile
  left join public.user_account_identities identity on identity.user_id = profile.id
  join public.groups lunch_group on lunch_group.id = target_group
  where profile.id = target_user;
  return jsonb_build_object(
    'display_name', coalesce(target_name, 'Lunch Loop friend'),
    'account_email', target_email,
    'group_name', group_name
  );
end;
$body$;

grant execute on function public.add_known_lunch_loop_member(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
