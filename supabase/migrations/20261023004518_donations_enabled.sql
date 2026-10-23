-- Optional donation link. Off until a site admin turns it on, so the public
-- Stripe Payment Link can stay unpublished while the account is in review.
-- The link does not change restaurant selection or unlock features.

alter table public.site_settings
  add column if not exists donations_enabled boolean not null default false;

create or replace function public.get_donations_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    (select donations_enabled from public.site_settings where singleton),
    false
  );
$$;

create or replace function public.global_admin_set_donations_enabled(new_enabled boolean)
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
  set donations_enabled = coalesce(new_enabled, false),
      updated_at = now(),
      updated_by = auth.uid()
  where singleton;
end;
$body$;

revoke all on function public.get_donations_enabled() from public, anon, authenticated;
grant execute on function public.get_donations_enabled() to anon, authenticated;

revoke all on function public.global_admin_set_donations_enabled(boolean) from public, anon, authenticated;
grant execute on function public.global_admin_set_donations_enabled(boolean) to authenticated;
