# Roadmap

Lunch Loop uses private per-loop memberships. A signed-in person without an
active loop may create their first private crew; joining an existing crew still
requires an owner-issued, Google-email-bound invitation. The multi-loop
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
4. Configure Google Cloud budgets/quotas and observe real costs per active loop.
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

## Respectful monetization

Never bias restaurant selection. The safest early option is a low-frequency,
optional “Keep Lunch Loop running” contribution after a completed decision,
with clear opt-out and no feature pressure.

Possible later options: group supporter plan, gifting, or optional post-choice
actions such as reservations, order-ahead, calendar, or directions—with clear
disclosure. Consider organization workflow pricing separately from restaurant
search data.

Avoid sponsored search results, paid smart-pick boosts, restaurant ranking,
selling group behavior, building a restaurant ad audience, or monetizing Google
Places content. Move off Vercel Hobby and obtain current hosting, payment, tax,
and Google Maps Platform guidance before taking payments.
