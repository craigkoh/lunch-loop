# Lunch Loop

A mobile-first meal-decision app for private groups of 2–6 friends.
Lunch Loop uses Next.js, Tailwind, Supabase, Google Places API (New), optional
Discord/Resend notifications, and a PWA-friendly interface.

Current release: version 0.1.0, build 2026.10.01.58.

Start with the [Documentation Index](docs/README.md). It links the concise
product, development, operations/security, integrations, roadmap, and release
guides.

## Run locally

Use [Development and Deployment](docs/DEVELOPMENT.md) for Node, Docker Desktop,
Supabase, environment variables, migrations, backups, OAuth, and deployment.

The app needs Supabase and Google Places variables. It does not create
browser-only restaurant or group data.

## First real-group setup

1. Configure Google as a Supabase Auth provider.
2. Set the production Supabase Site URL to https://lunchloop.app and allowlist
   the production and localhost authentication callbacks.
3. Sign in with Google. If you do not already belong to a loop, create your
   first private Lunch Loop; otherwise accept an owner-issued invitation to
   join the appropriate crew.
4. Owners invite friends by intended Google email. Their join order becomes the
   initial picker rotation.

## What is implemented

- Home, Add Place, Lunch Database, History, Stats, Settings, My Loops,
  Feedback, and Global Admin.
- Per-loop Google Places searching inside an owner-selected home area,
  1–35-mile radius, and local time zone, with durable request limits.
- Google Place ID duplicate prevention within each separate loop.
- Standing recurring rotations and reusable Occasion loops for special nights
  out, both with picks, vetoes, history, popularity, monthly recap, and
  never-again tracking.
- One-time email-bound crew invitations, invitations to create an independent
  loop, multi-loop accounts, and row-level security.
- Owner controls for people, invitations, area, restaurant cleanup,
  export/archive/transfer, and Discord; plus Account settings with saved
  appearance controls. A friend-readable personal export and self-service
  account deletion are intentionally deferred pending product review.
- PWA installation guidance, orange icons, foreground refresh, and public
  Privacy/Terms pages.

## Project layout

| Location | Purpose |
| --- | --- |
| src/ | Application routes, components, UI, and server code. |
| supabase/migrations/ | Ordered permanent schema, security, and workflow changes. |
| docs/ | Human maintenance documentation. |
| .env.example | Safe variable template. |
| .env.local | Local credentials; never commit or share. |
| .vercel/project.json | Private local Vercel project link. |
| /Users/craigkohler/Desktop/Lunch Loop Backups/ | Private database backups outside source control. |

Before deployment, run npm run lint and npm run build. Before a production
database change, create a verified backup and apply the reviewed migration
explicitly; see [Development and Deployment](docs/DEVELOPMENT.md).
