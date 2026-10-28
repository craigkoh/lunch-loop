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

Use a separate local/test group for experiments. Verify Google sign-in, a
one-time email link, restaurant search, selection/veto, Settings, Feedback,
and the owner/admin paths changed.
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

The same command runs the Global Admin deletion fixture. Its sample Discord
address must match the webhook format check. Use a fake
`https://discord.com/api/webhooks/...` value. Do not put a live webhook in the
fixture, and do not loosen the database check to make the sample pass:

    PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
      docker exec -i supabase_db_lunch-rotation \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
      < supabase/tests/global-admin-delete-fixture.sql

Run all three fixtures after a local schema reset when a change touches
invitations, deletion, Occasion loops, or account lifecycle. Each fixture
rolls its own data back.

When a change touches the donation switch, also run
`supabase/tests/donations-flag-fixture.sql` the same way. It checks that
`donations_enabled` starts off, a member cannot turn it on, and a site admin
can turn it on and back off.

When a change touches email sign-in, profile names, or feedback credit, also
run:

    PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
      docker exec -i supabase_db_lunch-rotation \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
      < supabase/tests/email-signin-and-feedback-fixture.sql

Direct dependencies in package.json stay on exact versions, without a caret
or tilde. After a dependency change, run `npm audit`. Prefer the smallest
patch or minor upgrade that clears a warning. On 2026-10-20, Next.js,
eslint-config-next, and @next/swc-wasm-nodejs moved from 16.3.1 to 16.3.8,
and the lockfile picked up patched js-yaml, source-map-js, brace-expansion,
and sharp. Five high warnings remain in the ESLint glob libraries (braces,
micromatch, fast-glob, and the Next lint plugin that depends on them). There
is no patched braces release. `npm audit fix --force` would downgrade
eslint-config-next to 14.2.35, which does not match Next.js 16, so that
downgrade was not applied.

## Database changes

1. Add a timestamped SQL file with `npx supabase migration new <name>`. Never
   edit a migration already applied in production.
2. Test locally with npx supabase db reset.
3. Run relevant rollback-safe SQL fixtures, then lint and the production build.
4. Do not apply the migration to production yourself. The maintainer bot
   applies pending migrations to production after a checksummed backup
   (see Backup and restore). Ideally, the same migration is tested on a
   separate staging project before that production apply.
5. Verify the affected production flow after the bot’s apply and the
   application deploy.

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

3. Deploy only after the maintainer bot has applied any pending migration:

       npx vercel --prod --yes --scope craig-kohlers-projects

4. Smoke-test the canonical domain: Google sign-in, an email magic link, Add
   Place, a decision/veto, Settings, Feedback, Global Admin, and Discord if
   configured.

Production is https://lunchloop.app. A production deployment still redirects
its `*.vercel.app` host there, and that address should not be shared. Preview
deployments stay on their own host and sign in against the staging Supabase
project, using that preview origin for Google and magic-link redirects. Local
development does the same with localhost. Redeploy after server-side
environment-variable changes.

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
whether to switch traffic. Production is on the Supabase Free plan, which has
no point-in-time recovery and no downloadable managed backups, so these manual
dumps are the only restore point. Take one before each database change. The
maintainer bot also keeps a rolling 14-copy data backup on its box; see
[Operations](OPERATIONS.md#database-backups).

## Sign-in callback essentials

In the production Supabase project, set Site URL to https://lunchloop.app and
allowlist the callback and confirm routes, including local development. The
staging project used by Vercel previews allowlists that preview origin
instead. Google’s OAuth client redirect URI remains the exact Supabase
callback supplied by its provider settings, not Lunch Loop’s /auth/callback.
Email magic links prefer /auth/confirm with `type=email`. Confirm-signup mail
uses the same path with `type=signup`. Supabase's default template, which is
what staging sends until custom SMTP is turned on, instead returns `?code=`
to /auth/callback. See [Integrations](INTEGRATIONS.md) before changing
identity configuration.

## Previewing the pick thank-you

Run `npm run dev` and open `http://localhost:3000/dev/receipt`. It shows the
receipt (a regular lunch and a first lunch), the tip jar, and the one-liner
inside the orange hero, using fixture data. The page calls `notFound()` when
`NODE_ENV` is `production`, so it is a 404 on lunchloop.app.
