# Product and User Guide

Lunch Loop is a private-crew, mobile-first restaurant decision app for groups
of 2–6 friends. It replaces the group-chat question “you pick” with a shared
restaurant database, picks, and one veto per other member.

Lunch Loop remains the product name even for dinner. Decision wording changes
to dinner at 4:00 PM in the loop’s local time zone.

## Loop types

Every private Lunch Loop is one of two types. Both types keep their own people,
home area, restaurant database, history, statistics, notifications, and
never-again calls.

| Type | Best for | Picker behavior |
| --- | --- | --- |
| Standing | A recurring lunch or dinner crew | Completed meals hand the next picks to the next member in the saved rotation. |
| Occasion | A one-off or infrequent night out | The owner makes the first picks. After an Occasion is completed, any member may start another one and becomes that night's picker. There is no automatic handoff. |

Existing Lunch Loops are Standing. A loop type is chosen when a new loop is
created and is not changed later, so its history always has one clear rhythm.

## How a loop works

1. A signed-in person without an active Lunch Loop may create their first
   private Standing or Occasion loop and set its name, home area, search radius
   (1–35 miles), and time zone.
2. An owner can add a person they already share another active Lunch Loop with
   directly, invite a new person by intended Google email, or generate a short
   shareable one-time code and link when email is not handy. Direct additions
   receive email and an in-app welcome message. Email invitations are bound to
   the intended Google account; shareable codes are for the first signed-in
   person to redeem them. Both are single-use, expire after 14 days, reserve
   one of the remaining six crew spots, and can be revoked. Owners may create
   one separately named shareable code for each currently open crew spot. Any member may also
   refer someone to start an independent Lunch Loop. Owners can prepare
   invitations anytime, but new members join only when no meal decision is
   active or awaiting closure, keeping its picks and vetoes fair.
3. Any group member can add a restaurant at any time. Google search results
   are constrained to the loop area and indicate existing entries.
4. The picker chooses exactly one restaurant per group member and sets the
   planned date/time. In a Standing loop the picker follows the rotation. In an
   Occasion, the owner picks first and, after a completed occasion, the member
   who starts the next one picks. Manual search, filters, and smart selections
   are available. A loop requires at least two members and one active
   restaurant per member.
5. Every member except the suggester gets one veto. The first veto locks the
   selection and removes one choice. The final remaining restaurant wins.
6. The app records the winning visit once. Anyone may move the meal date/time
   forward. After that time passes, any member can close the decision. A
   Standing loop hands the next round to the next person in rotation; an
   Occasion simply remains ready for any member to start its next night.

## Restaurants when people join another loop

Restaurant databases remain private to their own loops. When an existing Lunch
Loop user joins a new Standing or Occasion loop, Lunch Loop copies the place
details for restaurants they added in their other loops. It never moves the
source records or copies visit counts, vetoes, last visits, or never-again
calls. Google Place ID deduplication keeps one target-row; if two new members
contributed the same place, the first person to join the new loop receives the
added-by credit. When creating an Occasion, the owner receives the same clean
copy of their existing additions before inviting anyone else.

## Everyday screens

| Screen | Purpose |
| --- | --- |
| Home | Live decision, the next action, remaining vetoes, planned meal time, and list facts. |
| Add Place | Google Places search and multi-select add flow. |
| Lunch Database | Private search, contributor/cuisine filters, useful sorts, restaurant facts, map, and directions. |
| History and Stats | Completed choices, vetoes, never-again places, win rates, popularity, heat map, and recap facts. |
| Settings | Owner controls for people, Standing rotation or Occasion crew, invitations, area/radius/time zone, cleanup, export/archive/transfer, and Discord. |
| Account settings | Saved System, Light, or Dark appearance. The same theme is applied across signed-in, public, install, and legal pages. |
| My Loops | Active-loop switcher and loop management. An account can own up to the site-wide configured number of active loops (initially four). |
| Feedback | Signed-in bug, idea, question, and note submission. |

Restaurant cards should be clickable. Their detail panel combines
Google-provided information, required attribution, and group facts such as who
added it, picks, vetoes, and last visit.

## Roles and boundaries

| Role | What it can do |
| --- | --- |
| Member | Add places, participate, veto once when eligible, move an active meal forward, browse shared data, submit feedback, and refer a new independent loop. |
| Owner | All member abilities plus crew management (and Standing rotation), crew invitations, area/radius/time-zone changes, restaurant removal, export, archive, transfer, and Discord. |
| Global Admin | Site-level groups, invite requests, feedback, usage limits, suspended groups, safeguards, and explicitly confirmed permanent loop deletion. Its overview cards open focused reports for loops, people, restaurants, open decisions, and winners. This is assigned in the database, never by a browser email test. |

Normal users access only their own loops. Google Place IDs are unique inside a
loop, so groups never share restaurant history or statistics.

## Account and lifecycle rules

- Google sign-in requests only openid, email, and profile. Lunch Loop does not
  read Gmail, Drive, Calendar, Contacts, Maps Timeline, or device location.
- A loop has two to six members. The database enforces the six-member cap on
  every join path. A pending email or shareable invitation reserves one of the
  remaining seats, so an owner never accidentally promises the same spot twice.
- Crew names are specific to each Lunch Loop. An owner can label someone
  differently in another loop without changing that person’s Google account
  name or their name elsewhere in Lunch Loop.
- A shareable code is a bearer invite: anyone who receives it can use it once,
  so owners should text it only to the intended friend. Owners can create up
  to one pending code per open crew spot, give each an optional private label,
  and revoke each code independently.
- Owners can archive a loop. It remains recoverable for 30 days before a
  permanent deletion option becomes available.
- Friend-readable personal export and self-service account deletion are
  deliberately unavailable while their product and support workflows are
  reviewed. Their raw lifecycle RPCs are not granted to signed-in clients;
  hiding a screen is not the security boundary. A future design must clearly
  address readable labels instead of database IDs, solo-loop removal,
  shared-loop history, active decisions, ownership transfer, and the sole
  Global Admin safeguard.
- Contact [support@lunchloop.app](mailto:support@lunchloop.app) for account
  removal requests or help with a lifecycle action.

## Install on a phone

Lunch Loop is a Progressive Web App. The landing page and signed-in app link to
/install with iPhone/iPad and Android instructions. Installed apps refresh when
foregrounded, receive live updates when available, and recheck active state
periodically. Share https://lunchloop.app, not the legacy Vercel address.
