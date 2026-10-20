# Development and Deployment

Use this guide to run Lunch Loop locally and publish a reviewed change. The
current Mac has Node.js 22, npm, Docker Desktop, and uses Supabase/Vercel CLIs
through npx. Node 20 or later is appropriate.

## Local setup

1. Install Node 20+ and Docker Desktop. Open Docker before local Supabase work.
2. From the repository root:

       npm install
       cp .env.example .env.local

3. Start local Supabase, copy its local API URL/publishable key to .env.local,
   then recreate the local schema:

       npx supabase start
       npx supabase status
       npx supabase db reset

4. Run the application:

       npm run dev

Next.js normally serves http://localhost:3000. Generated directories
supabase/.temp/, .next/, and node_modules/ must not be committed. Docker only
needs to run while using the local Supabase stack.

Theme preference is stored per account and cached in browser storage. The root
theme initializer applies the cached preference on every route (including
install and legal pages); signed-in app pages then reconcile it with Supabase.
Keep light-mode styles unchanged when extending dark mode, and test both themes
on shared components before publishing.

## Environment variables

Copy names from .env.example. Put real values only in .env.local or Vercel’s
encrypted environment-variable settings.

| Variable | Where used | Notes |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Browser and server | Local URL from Supabase status or hosted project URL. |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser and server | Publishable/anon key; database RLS protects data access. |
| GOOGLE_PLACES_API_KEY | Server only | Enable Places API (New), restrict it, and never use NEXT_PUBLIC_. |
| RESEND_API_KEY | Server only, optional | Enables invitation/notification email. |
| RESEND_FROM_EMAIL, RESEND_REPLY_TO, ADMIN_NOTIFICATION_EMAIL | Server only, optional | Sender, reply-to, and admin notification addresses. |

Never put real keys, OAuth client secrets, database passwords, Discord webhooks,
or raw backup data in source, docs, screenshots, Git, or chat.

## Everyday workflow

    npx supabase start
    npm run dev
    npm run lint
    npm run build

Use a separate local/test group for experiments. Verify Google sign-in,
restaurant search, selection/veto, Settings, and the owner/admin paths changed.
For Occasion work, also run the rollback-safe fixture:

    PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
      docker exec -i supabase_db_lunch-rotation \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
      < supabase/tests/occasion-loop-fixture.sql

For account preference or future lifecycle work, run the rollback-safe
regression fixture after a local schema reset. It verifies self-only export,
saved theme preferences, and that destructive account-deletion RPCs are not
granted to signed-in clients. It also preserves the deeper lifecycle scenarios
for a future reviewed reintroduction. The fixture intentionally rolls back its
own data:

    PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
      docker exec -i supabase_db_lunch-rotation \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
      < supabase/tests/account-lifecycle-fixture.sql

## Database changes

1. Add a timestamped SQL file in supabase/migrations/. Never edit a migration
   already applied in production.
2. Test locally with npx supabase db reset.
3. Run relevant rollback-safe SQL fixtures, then lint and the production build.
4. Create and verify a production backup.
5. Confirm the linked production migration history matches local files, then
   review and apply only the pending migration:

       npx supabase migration list --linked
       npx supabase db push --linked --dry-run
       npx supabase db push --linked

6. Verify the affected production flow after deployment.

The previous migration-history drift was repaired on September 7, 2026; do not
manually alter migration history unless a future recovery procedure explicitly
requires it.

The 2026-10-19 foreign-key and policy changes are already recorded on the
hosted project as versions `20261020003630` and `20261020003631`. The files
in this repository use those versions. See
[Operations](OPERATIONS.md#routine-checks) before treating them as pending
work.

## Production deployment

1. Confirm a verified backup and production environment variables.
2. Run:

       npm run lint
       npm run build

3. Deploy:

       npx vercel --prod --yes --scope craig-kohlers-projects

4. Smoke-test the canonical domain: sign-in, Add Place, a decision/veto,
   Settings, Global Admin, and Discord if configured.

Production is https://lunchloop.app. The old Vercel address redirects to it and
should not be shared. Redeploy after server-side environment-variable changes.

## Backup and restore

Create a fresh private backup before database or workflow changes:

    backup_root="/Users/craigkohler/Desktop/Lunch Loop Backups"
    backup_stamp="$(date +%Y%m%d-%H%M%S)"
    backup_dir="$backup_root/lunch-loop-$backup_stamp"
    mkdir -p "$backup_dir"

    npx supabase db dump --linked --file "$backup_dir/schema.sql"
    npx supabase db dump --linked --data-only --use-copy --file "$backup_dir/data.sql"
    shasum -a 256 "$backup_dir/schema.sql" "$backup_dir/data.sql" > "$backup_dir/SHA256SUMS"
    (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS)

Backups may contain account information, sessions, and Discord configuration.
Keep them private. Never restore over production as a test: restore into a new
equivalent Supabase project, verify users/data/auth/integrations, then choose
whether to switch traffic. Prefer Supabase managed backup/PITR for an incident
in the existing project.

## OAuth callback essentials

In Supabase Auth, set Site URL to https://lunchloop.app and allowlist:

    https://lunchloop.app/auth/callback
    http://localhost:3000/auth/callback

Google’s OAuth client redirect URI remains the exact Supabase callback supplied
by its provider settings, not Lunch Loop’s /auth/callback. See
[Integrations](INTEGRATIONS.md) before changing identity configuration.
