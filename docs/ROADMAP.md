# Roadmap

Lunch Loop uses private per-loop memberships. A signed-in person without an
active loop may create their first private crew; joining an existing crew still
requires an owner-issued, email-bound invitation. The multi-loop
foundation is live: isolated data, 2–6 members, a Global Admin-configurable
limit of active loops per owner (initially four),
per-loop area/radius/time zone, feedback, Global Admin, Places limits, and PWA
support.

## Next priorities

1. Run a small private-crew beta. Verify independent groups, members in multiple
   loops, time zones, invitation/recovery flows, and support response.
2. Complete Google Places retention/attribution review before broad
   self-service, database maps, or commercial features.
3. Review the account-removal experience with real users before reintroducing
   self-service deletion. Design a friend-readable personal export, and make removal,
   shared-history preservation, solo-loop cleanup, and archive recovery easy
   to understand.
4. Observe real Google costs per active loop. Budget alerts and 300-a-day
   Places quotas are in place (2026-10-26); see
   [Integrations](INTEGRATIONS.md#google-maps-platform).
5. Obtain professional review of Privacy/Terms and the Lunch Loop name before
   broad public or monetized release.

## Public-launch gates

Do not promote unrestricted multi-loop creation or broad public marketing until:

- Independent groups and multi-loop accounts pass isolation, authorization,
  time-zone, and invitation tests.
- Google Places retention/attribution audit is complete.
- Support, abuse, suspension, invitations, limits, budgets, logging, and
  incident response are actively used and tested.
- Account lifecycle, policies, OAuth branding, and accessibility review are
  ready for public users.
- Measured provider cost and reliability can support increased activity.

Keep sign-in required before Places search. Any anonymous request form needs
rate limits and a hosted bot challenge.

## Future product ideas

- Google-compliant private database map: Google Map pins for the active group,
  synchronized with current filters/details.
- Office/team administration after the core friend experience is proven.
- A native iPhone wrapper only if the PWA has a real user-facing limitation.
- Show real site stats (e.g. lunches decided) on /support and receipts once usage grows, as V4V proof.

## Next PR (open list, added Oct 28, 2026)

Items Craig has approved for the next batch. More may be added.

- Rename "picked" to "won" (Chris's feedback). "Picked" reads like someone
  chose the place for a list, but it means the place won a lunch. Shows in
  the restaurant list, restaurant cards, and the details popup. Suggested:
  "🏆 2 wins · last won Oct 21", "No wins yet", sorts "Most wins" /
  "Fewest wins".
- A button to view a report or summary of your loop.
- A CSV download of loop data. Rules: export only our own data (lunch dates,
  winners, vetoes, suggesters, win counts) plus a Google Maps link per place.
  Do not export Google place details (names, addresses, ratings, phone, hours)
  because of Google Maps Platform terms. Members of that loop only, no emails,
  daily per-person limit, escape spreadsheet formulas, update the privacy page.
- Before the CSV work: check that what we already store from Google Places
  follows Google's caching rules, and report to Craig.
- Keep the random facts sprinkled through the app (do not remove them).

## Backlog

- Plate Loop is the live icon. The arrow is documented in
  [Design](DESIGN.md). Fork L and Tray LL stay in [docs/brand/](brand/) as
  studies.

## Respectful monetization

Never bias restaurant selection. The first step is live: a public Value for
Value page, a small “Fuel the loop” footer link, and a random note on a finished
pick: about 1 in 4 picks show nothing, and otherwise a paper receipt, a
one-liner, or a tip jar with equal odds, never the same style twice in a
row. Each one says plainly that it is an optional tip. On a wide
screen the note sits beside the result. On a phone it stacks under the
result. “Not now” hides it for that pick. There is no pop-up. A new database keeps `donations_enabled`
off until a site admin turns it on. Production has it on, with a live
Stripe Payment Link. A
donation does not change restaurant selection or unlock anything.

Possible later options: group supporter plan, gifting, or optional post-choice
actions such as reservations, order-ahead, calendar, or directions—with clear
disclosure. Consider organization workflow pricing separately from restaurant
search data.

Avoid sponsored search results, paid smart-pick boosts, restaurant ranking,
selling group behavior, building a restaurant ad audience, or monetizing Google
Places content. Vercel’s fair-use guidelines say asking for donations is not
commercial use, so donations can stay on Hobby. Move off Vercel Hobby and get
current payment, tax, and Google Maps Platform guidance before charging for
anything (a paid plan, ads, or paid features).
