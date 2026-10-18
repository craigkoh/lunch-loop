-- The initial account export returned raw database-oriented JSON. Keep the
-- implementation reserved for a future reviewed, friend-readable export and
-- remove client access rather than relying only on a hidden UI control.
begin;

revoke execute on function public.export_my_lunch_account_data() from authenticated;

comment on function public.export_my_lunch_account_data() is
  'Reserved for a future reviewed friend-readable personal-data export; not granted to signed-in clients.';

commit;
