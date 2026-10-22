# Integrations

Lunch Loop relies on Supabase, Google, and Vercel. Resend and Discord are
optional. Store credentials only in provider dashboards, Vercel variables, or
local .env.local, never here.

## Supabase and Google sign-in

Supabase provides Postgres, Auth, Row Level Security, Realtime, and database
functions. In Supabase Auth URL Configuration:

- Set Site URL to https://lunchloop.app.
- Allowlist https://lunchloop.app/auth/callback and
  http://localhost:3000/auth/callback.
- Keep only actively needed routes/domains. The legacy Vercel callback is not
  supported.

In Google Cloud, configure Google as the Supabase Auth provider using the exact
Supabase callback URL shown by provider settings. Do not replace it with Lunch
Loop’s callback: Google returns to Supabase first, then Supabase returns to
Lunch Loop.

For Google OAuth branding:

| Field | Value |
| --- | --- |
| Homepage | https://lunchloop.app |
| Privacy Policy | https://lunchloop.app/privacy |
| Terms of Service | https://lunchloop.app/terms |
| Authorized domain | lunchloop.app and actual Supabase project domain if Google requires it |
| Authorized JavaScript origin | https://lunchloop.app and the local origin when needed |

Google sign-in requests only openid, email, and profile. It does not request
Gmail, Drive, Calendar, Contacts, or device location.

## Email magic-link sign-in

Lunch Loop also signs people in with a one-time email link. There is no
password field and the app never calls a password sign-in. The Email provider
stays enabled so `signInWithOtp` can create an account (`shouldCreateUser`
true) and send the link.

Custom SMTP uses the same Resend account as invitation mail. In Supabase
Authentication → Emails → SMTP Settings:

- Enable custom SMTP.
- Host `smtp.resend.com`, port `465`, username `resend`.
- Password is the Resend API key. Store it only in the Supabase dashboard.
- Sender email matches `RESEND_FROM_EMAIL`, for example
  `Lunch Loop <invites@lunchloop.app>`.
- Sender name: Lunch Loop.

In Authentication → URL Configuration for the production project:

- Site URL remains `https://lunchloop.app`.
- Allowlist:
  - `https://lunchloop.app/auth/callback`
  - `https://lunchloop.app/auth/confirm`
  - `https://lunchloop.app/**`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`

The wildcard entries let a magic link return to the page the person was
trying to open, such as `/join`. The app also sends `emailRedirectTo` to
`/auth/callback` on that same origin, because Supabase's default template
(used until custom SMTP unlocks custom templates) verifies at
`/auth/v1/verify` and then redirects there with `?code=`. That callback must
be allowlisted exactly, or GoTrue drops the person on the Site URL after
confirming the email and no session is created. Keep only those Lunch Loop
origins.

Production deployments rewrite a `*.vercel.app` host to `https://lunchloop.app`
before Google or a magic link starts, so the production Supabase project does
not need the old Vercel alias on its allowlist. Preview deployments
(`VERCEL_ENV=preview`) and local development do not rewrite the host. They
send OAuth and magic-link redirects to their own origin. The staging Supabase
project used by previews needs that preview origin on its allowlist, including
`/auth/callback`, `/auth/confirm`, and a wildcard for return paths such as
`/join`. A preview URL looks like
`https://<project>-git-<branch>-<team>.vercel.app`.

In Authentication → Email Templates, use these links. Do not put a secret or
a real token in the template.

Magic Link (`supabase/templates/magic_link.html`):

    {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}

Confirm signup (`supabase/templates/confirmation.html`):

    {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}

`/auth/confirm` forwards that `type` to `verifyOtp`, and it also exchanges a
`?code=` if the default template redirected there. GoTrue stores a magic-link
hash as a recovery token and a confirm-signup hash as a confirmation token.
`type=email` finds either hash. `type=signup` finds only the confirmation
hash, so a magic-link template must stay on `type=email`. Hosted projects
need the markup pasted into the dashboard; the config file does not update
production templates. Until custom SMTP is enabled, the dashboard keeps
Supabase's default `{{ .ConfirmationURL }}` template. That link still signs
the person in: `/auth/v1/verify` confirms the email, then Lunch Loop exchanges
the returned `?code=` at `/auth/callback`. If the code or an auth error lands
on any other page, the proxy forwards it there. A `#access_token` fragment is
finished in the browser, because the server never receives it. Disable
email-link click tracking in Resend so a custom link is not rewritten.

An email invitation still matches `auth.users.email`. A magic-link user and a
Google user with the same address can redeem the invite that was sent to that
address. Local mail is captured by Supabase Inbucket or Mailpit
(`npx supabase status` prints the mailbox URL). No message leaves the machine.

## Feedback alerts

A new feedback row can notify the maintainer bot from Postgres. The database
reads two Supabase Vault secrets by name. Create them in the Vault UI with
those exact names and never copy the values into Git, docs, or chat:

| Secret name | What it holds |
| --- | --- |
| lunchloop_feedback_webhook_url | HTTPS URL that receives the feedback JSON |
| lunchloop_feedback_webhook_key | Bearer token sent as `Authorization: Bearer …` |

The JSON includes the feedback id, kind, title, details, page, build,
created time, reporter display name, credit opt-in, credit name, and the
Global Admin link. It does not include the reporter’s email address. If
either secret is missing, the URL is not https, or Global Admin has turned
feedback alerts off, the insert still succeeds and `notified_at` stays empty.
The Resend note to `ADMIN_NOTIFICATION_EMAIL` is the fallback and also omits
the reporter email.

## Google Maps Platform

Enable Places API (New) for the server-only Google key. Restrict it to the
minimum APIs/environments, rotate it if exposed, and never name it with
NEXT_PUBLIC_.

Lunch Loop uses Google for area lookup, restaurant text search, and place
details. It stores Place IDs and selected restaurant fields per private group
and displays “Place information from Google Maps,” a Google map, and directions.
Do not remove or obscure required attribution.

Before broad public release or a data-model/map/advertising change:

1. Review current [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies),
   [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms),
   and [Google Privacy Policy](https://policies.google.com/privacy).
2. Audit every Google-derived field and its refresh/deletion requirement. Do
   not assume all place content can be stored indefinitely; Place IDs have
   separate treatment.
3. Show Google-derived restaurant pins only on a Google Map.
4. Never sell placement in search, smart picks, or maps, or build advertising
   or restaurant analytics from Places data.

Global Admin shows application request counts/limits. Google Cloud is the
authority for billing: configure budgets in
[Cloud Billing](https://console.cloud.google.com/billing) and quotas in
[Google Maps Platform Quotas](https://console.cloud.google.com/google/maps-apis/quotas).

## Resend and inbound email

Resend is optional. Without it, owners can still copy one-time invitation links
or codes. Email activates only with a server-side Resend key.

1. Create Resend, verify lunchloop.app by adding every Resend DNS record in
   Vercel DNS, and do not remove the site’s web records.
2. Add these production Vercel variable names with real values only in Vercel:

       RESEND_API_KEY=...
       RESEND_FROM_EMAIL=Lunch Loop <invites@lunchloop.app>
       RESEND_REPLY_TO=feedback@lunchloop.app
       ADMIN_NOTIFICATION_EMAIL=craig@lunchloop.app

3. Redeploy, send a test crew invitation, and check sender, reply-to, link,
   short code, and acceptance flow.

Vercel DNS does not provide inboxes. Configure an email forwarding/mailbox
provider for these addresses, directing each to a private maintainer inbox:

| Address | Purpose |
| --- | --- |
| invites@lunchloop.app | Resend sender identity |
| feedback@lunchloop.app | Invitation replies and feedback contact |
| support@lunchloop.app | Public support and legal-policy contact |
| craig@lunchloop.app | Global Admin notification recipient |

Use a provider such as ImprovMX or Google Workspace; verify delivery after MX
changes. Keep the forwarding destination out of documentation and source
control.

## Discord notifications

Only a loop owner can enable Discord. In Discord: Server Settings → Integrations
→ Webhooks → New Webhook, choose a channel, copy its URL, then paste it in
Lunch Loop Settings, select event types, save, and send a test.

The webhook is private and not returned to the browser after save. Treat it
like a password. When enabled, member display names, restaurant names, planned
local date/time, and decision events are copied to the selected Discord channel.

## PWA and hosting

Vercel hosts the canonical app at lunchloop.app. The manifest, generated orange
icons, favicon route, and foreground synchronization make it installable on
iPhone/iPad and Android. Test phone installation after domain, icon,
service-worker, or authentication changes.

