-- `status` is also an output column in these table-returning functions. Fully
-- qualify it in the expiry housekeeping queries so PostgreSQL never confuses
-- the output variable with the invitation table column.

create or replace function public.get_group_member_invitations(target_group uuid)
returns table(id uuid, recipient_email text, status text, expires_at timestamptz, created_at timestamptz, accepted_at timestamptz)
language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_group_owner(target_group) then raise exception 'Only this Lunch Loop''s owner can view its invitations'; end if;
  update public.group_member_invitations as invitation
  set status = 'expired'
  where invitation.group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  return query
  select invitation.id, invitation.recipient_email, invitation.status, invitation.expires_at, invitation.created_at, invitation.accepted_at
  from public.group_member_invitations as invitation
  where invitation.group_id = target_group
  order by invitation.created_at desc;
end;
$body$;

create or replace function public.get_group_creation_invitations(target_group uuid)
returns table(id uuid, recipient_email text, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public, pg_catalog as $body$
begin
  if not public.is_group_member(target_group) then raise exception 'This Lunch Loop is not available'; end if;
  update public.loop_creation_invitations as invitation
  set status = 'expired'
  where invitation.source_group_id = target_group
    and invitation.status = 'pending'
    and invitation.expires_at <= now();
  return query
  select invitation.id, invitation.recipient_email, invitation.status, invitation.expires_at, invitation.created_at
  from public.loop_creation_invitations as invitation
  where invitation.source_group_id = target_group
    and (invitation.invited_by = auth.uid() or public.is_group_owner(target_group))
  order by invitation.created_at desc;
end;
$body$;

notify pgrst, 'reload schema';
