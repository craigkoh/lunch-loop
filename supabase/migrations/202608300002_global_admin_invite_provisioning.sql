-- Allows the invite-only administrator to turn an approved request into a
-- private Lunch Loop without temporarily reopening public group creation.

do $migration$
begin
  execute $function$
    create or replace function public.global_admin_create_lunch_group_for_request(
      target_user uuid,
      new_group_name text
    )
    returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $body$
    declare new_group uuid; new_code text;
    begin
      if not public.is_site_admin() then
        raise exception 'Global administrator access is required';
      end if;
      if char_length(trim(coalesce(new_group_name, ''))) not between 1 and 80 then
        raise exception 'Group name must be between 1 and 80 characters';
      end if;
      if not exists(select 1 from public.lunch_loop_invite_requests where user_id = target_user and status in ('new', 'reviewed', 'invited')) then
        raise exception 'Create a crew only for an active invite request';
      end if;
      if exists(select 1 from public.group_members where user_id = target_user) then
        raise exception 'This person already belongs to a Lunch Loop';
      end if;

      insert into public.groups(name)
      values (trim(new_group_name))
      returning id, invite_code into new_group, new_code;
      insert into public.group_members(group_id, user_id, role, rotation_order)
      values (new_group, target_user, 'owner', 0);
      update public.lunch_loop_invite_requests
      set status = 'invited',
          reviewed_at = now(),
          reviewed_by = auth.uid()
      where user_id = target_user;
      return jsonb_build_object('group_id', new_group, 'invite_code', new_code);
    end;
    $body$
  $function$;

  execute 'revoke all on function public.global_admin_create_lunch_group_for_request(uuid, text) from public';
  execute 'grant execute on function public.global_admin_create_lunch_group_for_request(uuid, text) to authenticated';
end;
$migration$;
