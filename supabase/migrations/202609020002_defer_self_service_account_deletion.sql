-- Account export and preferences are ready for members. The destructive
-- account-deletion flow needs a separate product/operations review, so keep
-- its implementation dormant rather than merely hiding a browser control.
begin;

revoke execute on function public.get_my_account_lifecycle() from authenticated;
revoke execute on function public.delete_my_lunch_account(text) from authenticated;

comment on function public.get_my_account_lifecycle() is
  'Reserved for a future reviewed self-service account-deletion flow; not granted to signed-in clients.';
comment on function public.delete_my_lunch_account(text) is
  'Reserved for a future reviewed self-service account-deletion flow; not granted to signed-in clients.';

commit;
