alter table public.restaurants
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

update public.restaurants restaurant
set added_by = owner.user_id
from public.group_members owner
where restaurant.group_id = owner.group_id
  and owner.role = 'owner'
  and restaurant.added_by is null;

create index if not exists restaurants_group_added_by_idx
  on public.restaurants(group_id, added_by);
