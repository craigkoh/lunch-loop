# Operations and Security

This guide covers live-service administration and recovery. It is not a place
for credentials; use provider dashboards and Vercel environment variables.

## Routine checks

A maintainer needs access to the Lunch Loop Vercel project, hosted Supabase
project, Google Cloud project, and, when enabled, Resend and Discord.

Before a production change:

1. Back up the database and verify SHA256SUMS.
2. Review the migration. The maintainer bot applies it to production after a
   checksummed backup, ideally after the same migration has been tested on a
   separate staging project. Do not run supabase db push against production
   outside that process.
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

### Bot protection on sign-in (added 2026-10-26)

Email sign-in uses Cloudflare Turnstile (widget "Lunch Loop sign-in" on Craig's
Cloudflare account, hostnames lunchloop.app and localhost). The site key is
public and set in code or `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The secret key is
stored only in Supabase Auth > Bot and Abuse Protection (CAPTCHA provider:
Turnstile). Turn that on only after a deploy that sends `captchaToken`, or
email sign-in fails. Google sign-in is not affected.

- Authentication uses Google or a one-time email magic link through Supabase
  Auth. Lunch Loop does not collect or store passwords. An email invitation
  still has to match the invited address, whether that person signs in with
  Google or the magic link.
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
- A dependency audit on 2026-10-20 found 10 warnings (1 critical, 9 high) in
  the previous lockfile. The critical warning and four high warnings are
  cleared by the package updates recorded in Development and Deployment.
  Build 2026.10.19.59 is the release prepared to publish them. They reach
  lunchloop.app when that production deploy runs. Five
  high warnings remain inside the developer linter’s file-matching libraries.
  They do not run in the browser or on the live server. Do not downgrade
  eslint-config-next to Next 14 to silence them.
- Re-run `npm audit` after the next dependency change. The in-memory helper
  in src/lib/rate-limit.ts is still unused. The live limit for `/api/` is the
  Vercel Firewall rule above, plus sign-in and the Places limits.
- Global Admin user lookup is a bounded private full-name/email search, not a
  browser-downloaded directory. Permanent loop deletion requires Global Admin
  authorization and the exact loop name; it is intended for test loops or a
  verified removal request.
- A loop owner’s “known people” picker is also bounded: it only exposes people
  who share another active Lunch Loop with that owner. Adding one creates an
  immediate membership, copies only their restaurant additions into the new
  loop, and queues an in-app welcome message; it never exposes a site-wide
  member directory.
- Email invitations remain bound to the invited email address. Pending email
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
usage limits, feedback state/priority, the optional Value for Value ask, and
site-wide group-creation controls. A new database keeps `donations_enabled`
off. Turning it on shows “Fuel the loop” in the footer, linking to `/support`,
and shows a dismissible note on every finished pick: a receipt, a one-liner,
or a tip jar. “Not now” hides that note for that pick only. Turning it off
hides the footer link and every note, and `/support` says support isn’t open.
The Stripe Payment Link lives only on that page. It does not change restaurant
selection. Do not send a test payment from the Payment Link.
Prefer reversible actions: suspend a loop before deletion, lower Places limits
or pause new-loop creation during abnormal usage, revoke invitations rather
than delete data, and leave clear internal triage notes. For test-loop cleanup
or a verified removal request, the permanent-delete control requires the exact
group name and immediately removes the group and its group-scoped data.

Feedback is submitted by signed-in users and records category, title, details,
page path, loop context, build number, and an optional public credit name. A
new note can alert the maintainer bot when the Vault secrets are present and
the site switch is on. That alert does not include the reporter’s email.
Resend remains a fallback and also omits the reporter email. If the secrets
are missing or the switch is off, the insert still succeeds and notified_at
stays empty. When a report is shipped, Global Admin adds a reporter-visible
“What changed” note. Release notes thank the person only with the credit name
they opted in, for example “Fixed X (reported by Sam — thanks!).” A reporter
can withdraw that credit later. Private implementation notes never appear in
the reporter's history or data export.

## Incident response

| Situation | First response |
| --- | --- |
| Suspected key/webhook exposure | Revoke/rotate it in the provider dashboard, update secure config, redeploy if needed, and inspect logs. |
| Places usage spike | Lower limits in Global Admin, pause new loops if needed, check Google Cloud usage/quota/billing, and investigate activity. |
| OAuth failure | Check the Supabase project for that deployment. Production rewrites `*.vercel.app` to lunchloop.app. A preview stays on its own host, so its staging allowlist must include that origin. Also check Google client config. |
| Magic link signs in, then lands on /sign-in | Fixed in build .69. Auth logs show `POST /verify` 200 and a `Login` with `login_method=otp`, but the page ends at `/sign-in?error=signin`. Cause was `next={{ .RedirectTo }}` pointing at `/auth/callback`; `postAuthPath` in `src/lib/auth-redirect.ts` now unwraps it. A later 403 `otp_expired` on the same link is expected (one-time token). |
| Magic link not arriving or signs in with no session | Check Supabase custom SMTP (Resend), the redirect allowlist for that project (it must include `/auth/callback`), the spam folder, and Supabase Auth logs. `email_confirmed_at` set with `last_sign_in_at` empty means `/auth/v1/verify` confirmed the address and the app never exchanged the returned `?code=`. The Magic Link template uses `/auth/confirm` with `type=email` once custom templates are unlocked. The Confirm signup template uses the same path with `type=signup`. Until then, the default `{{ .ConfirmationURL }}` link is handled at `/auth/callback`. |
| Feedback webhook failing | Confirm Vault secrets lunchloop_feedback_webhook_url and lunchloop_feedback_webhook_key exist, the site feedback-alert switch is on, and pg_net request logs. A missing secret skips the alert and leaves notified_at empty. The Resend fallback still sends and does not include the reporter email. |
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
