drop policy if exists "site admins view all site admins" on public.site_admins;
create policy "site admins view all site admins" on public.site_admins for select to authenticated using (public.is_site_admin());

create or replace function public.global_admin_set_site_admin(target_user uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Global administrator access is required'; end if;
  if make_admin then
    if not exists(select 1 from public.profiles where id = target_user) then raise exception 'That person has not created a Lunch Loop profile'; end if;
    insert into public.site_admins(user_id, granted_by) values (target_user, auth.uid()) on conflict (user_id) do nothing;
  else
    if (select count(*) from public.site_admins) <= 1 then raise exception 'Lunch Loop must keep at least one global administrator'; end if;
    delete from public.site_admins where user_id = target_user;
    if not found then raise exception 'That person is not a global administrator'; end if;
  end if;
end;
$$;

grant execute on function public.global_admin_set_site_admin(uuid, boolean) to authenticated;
