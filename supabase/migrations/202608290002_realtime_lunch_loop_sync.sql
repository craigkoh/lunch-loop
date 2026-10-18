-- Keep installed web apps and open browsers synchronized as lunch decisions change.
-- Each table is guarded so the migration can safely be replayed in a fresh or existing project.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lunch_sessions') then
    execute 'alter publication supabase_realtime add table public.lunch_sessions';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lunch_session_candidates') then
    execute 'alter publication supabase_realtime add table public.lunch_session_candidates';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vetoes') then
    execute 'alter publication supabase_realtime add table public.vetoes';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurants') then
    execute 'alter publication supabase_realtime add table public.restaurants';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members') then
    execute 'alter publication supabase_realtime add table public.group_members';
  end if;
end $$;
