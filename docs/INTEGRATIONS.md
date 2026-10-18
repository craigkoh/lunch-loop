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

