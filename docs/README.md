# Lunch Loop documentation

Current release: version 0.1.0, build 2026.10.23.65. Production is
[lunchloop.app](https://lunchloop.app). This build reaches the live site when
the documented production deploy runs.

This is the starting point for a maintainer. Documentation describes intended
operation; application code and versioned database migrations are the source of
truth.

| Read this | When you need to |
| --- | --- |
| [Product and User Guide](PRODUCT.md) | Understand the product, member workflow, roles, limits, and data boundaries. |
| [Design](DESIGN.md) | Brand, color, type, components, voice, and the Plate Loop mark. |
| [Development and Deployment](DEVELOPMENT.md) | Run locally, add a migration, test, back up, or deploy safely. |
| [Operations and Security](OPERATIONS.md) | Administer production, recover from an incident, or review protections. |
| [Integrations](INTEGRATIONS.md) | Configure Supabase sign-in (Google or email magic link), Places, Resend, email forwarding, Discord, feedback alerts, or the Stripe donation link. |
| [Roadmap](ROADMAP.md) | Plan private-crew growth, public launch readiness, and ethical monetization. |
| [Release Notes](RELEASE_NOTES.md) | Share the latest friend-facing changes. |

Public policies are [Privacy Policy](https://lunchloop.app/privacy) and
[Terms of Use](https://lunchloop.app/terms). Source is in
src/app/privacy/page.tsx and src/app/terms/page.tsx. The Value for Value page
is src/app/support/page.tsx and follows `donations_enabled`.

## Repository map

    src/                    Next.js routes, UI, server handlers, shared code
    supabase/migrations/     Ordered, immutable production schema changes
    docs/                   This human-maintenance documentation
    .env.example            Safe variable names and sample values only
    .env.local              Local credentials; never commit or share
    .vercel/project.json    Local Vercel project link; keep private

Private database backups are outside the repository at
/Users/craigkohler/Desktop/Lunch Loop Backups/. They can contain account and
Discord configuration data. Do not commit, share, or put them in a public
cloud-synced folder.

## Documentation rules

- Never place API keys, OAuth client secrets, webhook URLs, database passwords,
  access tokens, backup contents, or personal inbox destinations here.
- Use variable names and redacted values such as GOOGLE_PLACES_API_KEY=....
- Add a migration rather than editing an already-applied migration.
- Update the relevant guide with workflow, integration, or deployment changes.
  Update the build number only for a published application build.
