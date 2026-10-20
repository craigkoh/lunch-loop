# Operations and Security

This guide covers live-service administration and recovery. It is not a place
for credentials; use provider dashboards and Vercel environment variables.

## Routine checks

A maintainer needs access to the Lunch Loop Vercel project, hosted Supabase
project, Google Cloud project, and, when enabled, Resend and Discord.

Before a production change:

1. Back up the database and verify SHA256SUMS.
2. Review the migration; do not use supabase db push on current production.
3. Run npm run lint and npm run build.
4. Deploy and test the canonical URL logged out and as an owner.
5. Confirm the active decision, restaurant search, and notification path
   affected by the change.

On 2026-10-19 two database changes were applied directly to the hosted
Supabase project, outside a repository change. No checksummed schema and
data backup was taken beforehand. Hosted migration history already records
them, using the versions below (00:36 UTC on 2026-10-20, the evening of
2026-10-19 Central time):

- `supabase/migrations/20261020003630_fk_covering_indexes.sql` adds 25
  indexes on foreign-key columns.
- `supabase/migrations/20261020003631_rls_initplan_and_site_admins_merge.sql`
  rewrites the profile read and profile update policies so `auth.uid()` is
  planned once per check, and merges the two site-admin read policies into
  one policy with the same access.

The repository files use those same version numbers, rather than a new
`YYYYMMDD` sequence, so a migration list matches production and a later
push treats them as already applied. The statements use `IF NOT EXISTS` and
`IF EXISTS` so running the SQL again does not create a second index or a
second policy. Take the checksummed backup in Backup and restore before any
further database change. Do not repair migration history to different
version numbers.

At least monthly, review Global Admin feedback, suspended groups, invite
requests, seven-day Places usage, provider errors, and Google Cloud budgets.

## Security model

- Authentication uses Google through Supabase Auth.
- Supabase Row Level Security scopes members to their own loops. Owner and
  Global Admin actions use server/database checks; a visible UI control is
  never the only permission check.
- Database triggers and invitation RPCs enforce the six-member crew cap and the Global
  Admin-configured active-loop owner cap (initially four) at the write
  boundary, including invitation redemption and ownership transfers.
  Per-loop and per-owner advisory locks make simultaneous requests deterministic.
- Signed-out visitors are redirected before private pages render: /settings,
/history, /stats, /add-place, /database, /feedback, /loops, and /global-admin.
  Landing, legal, install, and onboarding routes are deliberately public.
- State-changing and quota-spending routes require an authenticated same-origin
  request. Sensitive responses use private, no-store caching.
- Production serves HTTPS, HSTS, CSP, anti-framing, MIME-sniffing, referrer,
  and permissions-policy headers. Realtime uses wss://*.supabase.co in CSP.
- Google and Resend keys are server-only. The browser has the Supabase
  publishable key only; RLS protects its access. Local generated credentials in
  supabase/.temp/ are ignored by Git.
- Anonymous visitors have no direct grants on public tables or RPC functions.
  Signed-in client calls use only explicitly granted RPCs and RLS-scoped reads.
- Durable per-person/per-loop Google Places limits are enforced before Google
  calls. Global Admin shows recent usage and can change limits.
- The Vercel Firewall allows 60 requests per minute from each client IP on
  paths under `/api/`. This custom rule was added on 2026-10-19. Before that
  change the project firewall config was empty. The limit sits in front of
  the app and does not replace sign-in, same-origin checks, row-level
  security, or the Places limits.
- Global Admin user lookup is a bounded private full-name/email search, not a
  browser-downloaded directory. Permanent loop deletion requires Global Admin
  authorization and the exact loop name; it is intended for test loops or a
  verified removal request.
- A loop owner’s “known people” picker is also bounded: it only exposes people
  who share another active Lunch Loop with that owner. Adding one creates an
  immediate membership, copies only their restaurant additions into the new
  loop, and queues an in-app welcome message; it never exposes a site-wide
  member directory.
- Email invitations remain bound to the intended Google account. Pending email
  and shareable invitations each reserve one open crew seat, so revoke an
  unused invitation to free that seat. A separate
  owner-created shareable code is intentionally a bearer invite for the first
  person to redeem it; its 12-character code has 60 bits of cryptographic
  randomness, is stored only as a hash, expires in 14 days, and can be
  independently revoked. Owners can make up to one pending code per currently
  open crew spot and may attach a private owner-only label to track it.
- Account preferences use authenticated, caller-scoped database RPCs.
  Personal export and self-service account deletion are currently deferred:
  their lifecycle RPCs remain ungranted to signed-in clients, not merely hidden
  in the UI. Reintroduce them only after a product/support review covers a
  human-readable export, active decisions, ownership transfer, solo loops,
  shared-history de-identification, and the sole Global Admin safeguard.

Global Admin growth controls, summary reports, and usage limits are live. Run
lint and the production build before every release. Re-run the production
dependency audit after dependency changes.

## Home-screen startup recovery

The signed-in home screen uses one authenticated `get_lunch_loop_home_snapshot`
database function for the active loop, roster, places, current decision, vetoes,
and lightweight history summary. This avoids a client-side request waterfall on
cold browser/PWA starts. The client refreshes a nearly expired session before
the snapshot, refreshes once more if the first authorized call fails, then
retries initial reconnects with short backoff. It keeps already-loaded data on
a background refresh failure. A user-facing retry control appears only after
those automatic attempts fail.

For local Supabase commands and linked database dumps, Docker Desktop must be
running and its current CLI must be first on `PATH`. On this Mac use:

    PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" npx supabase status

## Global Admin playbook

Global Admin is database-assigned. It reviews groups, invite requests, feedback,
usage limits, feedback state/priority, and site-wide group-creation controls.
Prefer reversible actions: suspend a loop before deletion, lower Places limits
or pause new-loop creation during abnormal usage, revoke invitations rather
than delete data, and leave clear internal triage notes. For test-loop cleanup
or a verified removal request, the permanent-delete control requires the exact
group name and immediately removes the group and its group-scoped data.

Feedback is submitted by signed-in users and records category, title, details,
page path, loop context, and build number. It is reviewed only when a
maintainer opens the queue; it is not automatically monitored. When a report is
shipped, Global Admin adds a reporter-visible “What changed” note; private
implementation notes never appear in the reporter's history or data export.

## Incident response

| Situation | First response |
| --- | --- |
| Suspected key/webhook exposure | Revoke/rotate it in the provider dashboard, update secure config, redeploy if needed, and inspect logs. |
| Places usage spike | Lower limits in Global Admin, pause new loops if needed, check Google Cloud usage/quota/billing, and investigate activity. |
| OAuth failure | Check Supabase Site URL/redirect allowlist, Google client config, and canonical redirects in a private window. |
| Broken production release | Stop compounding changes, inspect Vercel/Supabase logs, and revert to a known good deployment if appropriate. |
| Discord failure | Confirm webhook/channel/events, then inspect Supabase asynchronous HTTP records/logs. |
| Data-loss concern | Stop destructive actions, preserve backups, use Supabase recovery/PITR where available, and validate restore outside production. |

## Data handling

[Privacy Policy](https://lunchloop.app/privacy) and
[Terms of Use](https://lunchloop.app/terms) must be updated whenever data
practices, analytics, advertising, payment, or account-deletion behavior
changes. Obtain qualified legal review before broad public or monetized release.

Google-derived restaurant content requires attribution and retention/use review.
Follow [Integrations](INTEGRATIONS.md#google-maps-platform) before changing
stored fields, maps, or monetization.
