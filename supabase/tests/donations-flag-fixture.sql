-- Run after the donations migration. Rolls back its own data.
-- donations_enabled starts off. A member cannot turn it on. A site admin can
-- turn it on and back off. get_donations_enabled follows that value.

begin;

set local session_replication_role = replica;
insert into public.profiles(id, display_name)
values
  ('d1111111-1111-4111-8111-111111111111', 'Donation Admin'),
  ('d2222222-2222-4222-8222-222222222222', 'Donation Member');
insert into public.site_admins(user_id)
values ('d1111111-1111-4111-8111-111111111111');
set local session_replication_role = origin;

do $check$
begin
  if (select donations_enabled from public.site_settings where singleton) is distinct from false then
    raise exception 'donations_enabled should default to false';
  end if;
  if public.get_donations_enabled() is distinct from false then
    raise exception 'get_donations_enabled should start false';
  end if;
end;
$check$;

select set_config('request.jwt.claim.sub', 'd2222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $check$
begin
  begin
    perform public.global_admin_set_donations_enabled(true);
    raise exception 'a member was able to turn donations on';
  exception
    when others then
      if sqlerrm <> 'Global administrator access is required' then
        raise;
      end if;
  end;
  if public.get_donations_enabled() is distinct from false then
    raise exception 'a rejected toggle changed donations_enabled';
  end if;
end;
$check$;

select set_config('request.jwt.claim.sub', 'd1111111-1111-4111-8111-111111111111', true);
select public.global_admin_set_donations_enabled(true);

do $check$
begin
  if public.get_donations_enabled() is distinct from true then
    raise exception 'donations_enabled did not turn on';
  end if;
end;
$check$;

select public.global_admin_set_donations_enabled(false);

do $check$
begin
  if public.get_donations_enabled() is distinct from false then
    raise exception 'donations_enabled did not turn off';
  end if;
end;
$check$;

rollback;
