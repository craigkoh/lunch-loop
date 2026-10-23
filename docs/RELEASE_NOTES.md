# Release Notes

## Build 2026.10.23.63

A finished lunch can leave a small thank-you under the result. It might be a
paper receipt, a one-line note, or a tip jar. You can ignore it.

- Every finished pick shows one of those notes while support is on. About half
  are receipts. The same style does not show twice in a row. “Not now” hides
  it for that pick. It sits after the restaurant card and the close actions,
  and it never covers them.
- The receipt is a lunch slip: the loop, the date, today’s pick, real counts
  for the crew, closed lunches, and vetoes, plus ads and paid placements at
  zero. A joke line is marked VOID instead of a made-up number. Decision fee
  is $0.00. Fuel the loop opens the Value for Value page.
- The page says a couple of bucks is plenty. Donations are not tax-deductible.
- `donations_enabled` still controls all of it. Off means no note, no footer
  link, and `/support` says support isn’t open. A new database still starts
  with the switch off.

## Build 2026.10.23.61

Lunch Loop has a new plate, fork, and knife icon. The footer says Lunch Loop
is run by Craig Kohler. An optional chip-in can appear after a lunch is
closed. It stays off until it is turned on, and it never changes which
restaurant is chosen.

- The app icon, favicon, Apple touch icon, and README hero use the fork and
  knife on a plate.
- The public footer and the signed-in footer say “Lunch Loop is run by Craig
  Kohler.”
- `site_settings.donations_enabled` defaults to false. A site admin turns it
  on in Global Admin after Stripe finishes reviewing the account. The public
  Payment Link then opens in a new tab. The copy is “Lunch Loop is free and
  ad-free. If it helped, you can chip in to keep it running.” A quiet footer
  link stays available while the switch is on. A dismissible note appears
  after a lunch loop is closed, at most once every 14 days, and it waits if
  the feedback note is showing. There are no perks and no effect on restaurant
  selection. No payment was made while the Payment Link is paused.

## Build 2026.10.22.60

You can now sign in with a one-time email link instead of Google. Feedback is
easier to send, and you can choose to be thanked by name when your report
ships.

- The sign-in page keeps Continue with Google and adds an email field. The
  link is a magic link only: there is still no password. A custom template
  confirms at /auth/confirm, so it works on another device and inside an
  in-app mail browser. Supabase's default template, used when custom mail is
  locked, confirms on Supabase and returns to /auth/callback with a one-time
  code that this browser exchanges. An invalid or expired link, and a rate
  limit, each get a short message on the sign-in page instead of a blank form.
- An email invitation still matches the invited address. Signing in with the
  magic link for that address is enough; it does not have to be Google.
- When an account has no Google name, Lunch Loop uses the part of the email
  before @ as the starting display name. A photo is stored only when one is
  provided.
- Signed-in pages show Feedback / Report a bug. The form already includes the
  page and build. After a decision is closed, a dismissible prompt appears at
  most once every 14 days for that person.
- Feedback can include an optional credit name. The checkbox starts
  unchecked. Release notes use only that opted-in name, for example “Fixed X
  (reported by Sam — thanks!).” The person can withdraw the credit later.
- A new feedback row can alert the maintainer bot. The address and key stay
  in Supabase Vault. The alert and the Resend fallback both leave out the
  reporter’s email address. A missing secret or the site switch skips the
  alert without blocking the note.
- Preview deployments stay on their own Vercel host and sign in there.
  Production `*.vercel.app` addresses still open lunchloop.app. Confirm-signup
  mail uses `type=signup`; magic-link mail uses `type=email`.
- Starting a first Lunch Loop with no invitation no longer fails a hidden
  20-character check. The create form was sending an empty invitation token, and
  that empty string was validated as if it were a real token. A blank token
  is now left out, and the first-loop path runs. If a field still needs a
  change, the message names that field in plain language instead of showing
  the validator’s own wording.
- City suggestions on the create-loop form open directly under the search-area
  field, including in Safari. Arrow keys, Enter, and a tap choose a city, and
  the list closes after that pick.

## Build 2026.10.19.59

This is the build being published. It gathers the October 19 database and
front-door work with the October 20 maintenance. It reaches
[lunchloop.app](https://lunchloop.app) when the production deploy in
[Development and Deployment](DEVELOPMENT.md#production-deployment) runs. The
previous public build was 2026.10.01.58.

- Lunch Loop now keeps an index on the links between people, places,
  invitations, feedback, and meal decisions, so those lookups stay quick as
  a crew’s history grows.
- Profile and site-admin permission checks look up the signed-in person once
  per question. The same people can still see a profile or the admin list:
  you see your own profile and people you share a loop with, and a site
  admin still sees the admin list.
- The live site allows 60 requests a minute from each internet address on
  `/api/` paths. That limit was added on October 19 and is already in front
  of the site.
- The website framework and a few supporting packages were moved to the
  smallest newer versions that close the known security warnings. Five
  warnings remain, and they live only in the tool that checks the code while
  someone is developing. They do not run on the live site. Closing them would
  mean installing an older checker that does not match this version of the
  site, so they were left as they are.
- The practice test for permanently deleting a test Lunch Loop used a sample
  Discord address the database correctly refuses. The sample now has the shape
  of a Discord webhook address, and it is still a fake address, not a live
  webhook.
- If Google sign-in does not finish, Lunch Loop sends the person back to the
  sign-in page with a short message, instead of opening the home page as if
  the sign-in had worked.
- Invitation links made from a temporary Vercel preview address now point at
  lunchloop.app. Links made on a developer’s own computer still stay on that
  computer.
- Invitation, feedback, and “add a known friend” responses are marked so a
  shared cache should not store them. Area-search errors get the same mark.
- A database failure that was not written as a message for members now shows
  “Something went wrong” in the browser. The technical detail stays in the
  server log. Messages Lunch Loop wrote for members, such as a full crew or a
  bad invitation, still show as before.

## Build 2026.10.01.58

- Selected restaurant cards now wrap long names, addresses, hours, and Lunch
  Loop facts cleanly on narrow iPhone screens. Every selected-place detail
  remains readable while making picks.

## Build 2026.09.07.57

- What’s New now derives its visible **Last updated** date from the newest
  release entry, so it cannot be left behind by a new build.
- Global Admin overview cards open focused reports instead of scrolling the
  dashboard to a nearby summary block.
- Replaced the early **Most visited** cards on Home and Stats with **New on the
  list**, a useful fact while a crew is still building its history.

## Build 2026.09.07.56

- Locked every crew-change path once meal picks begin: owners and Global Admin
  cannot remove or reorder people until the current decision is completed or
  cancelled. Lunch Loop also prevents a crew from being reduced below two
  people.
- Pending email and shareable invitations now reserve the same pool of open
  seats, including when adding a friend from another Lunch Loop. A six-person
  crew cannot be accidentally over-invited; revoke an unused invitation to
  free its spot.
- Crew labels are now private to each Lunch Loop. Editing a name in one loop no
  longer changes that person’s Google account name or how they appear elsewhere.
- Matched the sign-in page’s return-path validation to the server callback.

## Build 2026.09.04.55

- Made picker results safe for narrow screens: long restaurant names and
  addresses now wrap inside the card, while the Add control stays visible.
- Added a direct Google Maps search-and-add flow inside the restaurant picker.
  A new place is added only to the current loop’s Lunch Database and is then
  ready to choose without leaving the decision.

## Build 2026.09.03.54

- Removed the raw technical personal-data download from Account settings and
  disabled its database RPC for signed-in browsers. It will return only after
  it is redesigned as a clear, friend-readable account export.

## Build 2026.09.03.53

- Made saved and System dark mode consistent on every route, including the
  header, footer, navigation, install guide, and public/legal pages.

## Build 2026.09.02.52

- Completed a dark-mode contrast pass across app chrome, cards, filters,
  controls, alerts, and feedback. The light palette is unchanged.
- Temporarily removed and permission-disabled self-service account deletion
  while its product and support workflow are reviewed. Account settings keeps
  its saved appearance preference and personal data export.

## Build 2026.09.02.51

- Added **Account settings** beside Log out. Members can choose System, Light,
  or Dark appearance, with the choice saved to their account.
- Members can download a personal data export and permanently delete their own
  account after typing a clear confirmation. The database preserves shared-loop
  data while de-identifying old account attribution, picks, and vetoes.
- Deletion is safely blocked until a shared active decision is resolved, a sole
  owner transfers shared loops, and a sole Global Admin adds another admin.
- Completed the submitted dark-mode feedback request and replaced the remaining
  dark feedback-history panel with the Lunch Loop orange treatment.

## Build 2026.09.01.50

- Owners may prepare crew invitations at any time, but a new member can join
  only after an active or chosen meal decision is fully closed. This preserves
  the fixed picks-and-veto count for that decision.
- Added a database-enforced six-person cap to every joining path, including
  direct additions of people already known from another Lunch Loop.

## Build 2026.09.01.49

- Feedback authors now see a friendly **What changed** update beside their own
  reports after a fix ships.
- Global Admin now has separate internal implementation notes and reporter
  updates. Marking a report shipped requires a reporter update, so people get
  a clear acknowledgement when their issue is fixed.

## Build 2026.09.01.48

- Fixed the place-search text color in the choice picker: it is now always
  dark and readable on its white field.
- Background and real-time refreshes no longer overwrite unsaved restaurant
  selections or unsaved lunch date/time changes. A saved change still reaches
  the rest of the crew normally, and a veto still locks picker choices.

## Build 2026.09.01.47

- Owners can make separate named shareable invitation codes and links for all
  currently open crew spots, instead of replacing the previous one.
- An optional private label helps an owner keep track of who each code is for.
  Codes remain single-use, expire after 14 days, and are independently
  revocable. Email invitations remain available unchanged.

## Build 2026.09.01.46

- Owners can generate a one-time shareable code and matching
  `lunchloop.app/join` link when they do not have a friend’s email address.
- Codes are short, single-use, expire after 14 days, can be revoked in
  Settings, and automatically replace the previous shareable code for the
  same Lunch Loop.
- A shareable code is separate from the existing email-bound invitation flow:
  email invites still require the intended Google account.

## Build 2026.08.31.42

- Hardened the database boundary: the two-active-loop owner limit and six-person
  crew limit now hold even during simultaneous invitation, creation, or
  ownership-transfer requests.
- Removed accidental anonymous access grants from public database tables and
  RPCs. Signed-in app functions remain explicitly granted and protected by RLS.
- Restaurant detail panels now load shortlist and veto facts in one authorized
  database request instead of two dependent reads.
- Strengthened API request-origin validation and refreshed the production
  security review. ESLint, TypeScript, and the production dependency audit
  passed with no known dependency vulnerabilities.

## Build 2026.08.31.41

- The Current Loop name in the global header now opens that loop’s home; **My
  Lunch Loops** remains the dedicated switcher destination.
- Removed the redundant global Settings button. Loop settings stay reachable
  from the selected loop’s Manage action in My Lunch Loops. Site admins now
  see **Global admin** in the universal header instead of inside loop settings.
- Bounded slow sign-in and home-snapshot requests. After a short delay, Lunch
  Loop gives clear Try again and Refresh page actions; a failed connection now
  shows a recovery panel rather than falling into setup content.
- Corrected the fallback getting-started checklist.

## Build 2026.08.31.40

- Made every active loop card a destination: tapping the current loop opens
  its home, while tapping another loop switches to and opens it. The current
  loop name at the top of My Lunch Loops also opens that loop.
- Replaced the unclear “Restaurant database / Just for this crew” fact with a
  straightforward crew-size summary.

## Build 2026.08.31.39

- Redesigned My Lunch Loops around a top-level **Switch Lunch Loops** chooser.
  Every active crew is visible immediately; the current crew is marked clearly,
  and each other crew has one direct **Use this loop** action.
- Removed the switch action from the current-loop details card. The details now
  focus only on the selected crew’s database and settings.
- Renamed the global context action from “Change” to **My Lunch Loops** so the
  same destination is clear from every signed-in page.
- Archived loops now live in their own quieter section, keeping day-to-day
  switching simple while retaining restore and deletion controls for owners.

## Build 2026.08.31.38

- Rebuilt the add-loop experience as a full-width app section, matching the
  rest of Lunch Loop instead of a narrow onboarding card.
- Replaced invitation-specific and “private Lunch Loop” creation language with
  neutral copy that works whether someone is creating their first crew or
  another one.
- Removed the redundant in-page back/settings breadcrumb; the standard app
  header, Current Loop strip, navigation, and footer now provide the
  consistent way around the signed-in app.
- Standardized the crowned **👑 Owner** badge in the Current Loop strip, My
  Lunch Loops, and Settings.

## Build 2026.08.31.37

- Simplified the app-wide loop context to **Current Loop**, with clear Standing
  or Occasion and Owner badges. The false “no active loop” fallback no longer
  appears while the header is still loading.
- Moved **Create a Lunch Loop** out of the current-loop card and into the
  top-level My Lunch Loops actions, where the two-owned-loop limit is clear.
- A signed-in person who does not belong to an active loop can now create their
  first private Lunch Loop directly. Joining an existing crew remains private:
  it still requires that owner’s one-time invitation.
- Rewrote the signed-out, no-loop, landing, and fallback setup copy around the
  two simple paths: create your own crew or join an invited crew.

## Build 2026.08.31.36

- Reworked signed-in navigation around a clear, persistent “Working in” trail
  that names the active Lunch Loop and its rhythm everywhere in the app.
- Redesigned My Lunch Loops to lead with the current crew, explain Standing
  versus Occasion behavior in plain language, and put switching or adding a
  private loop alongside the current-loop actions.
- Starting another loop from an existing crew now uses the normal app header,
  navigation, footer, and an explicit “Back to My Lunch Loops” path. First-time
  invitees still receive a focused, friendly setup screen.
- Replaced the remaining everyday black action buttons with Lunch Loop orange
  across key sign-in, joining, setup, and decision actions.

## Build 2026.08.31.35

This friend-release build focuses on a reliable, private multi-loop experience.

- Lunch Loop now supports two rhythms: **Standing** loops keep the familiar
  recurring picker rotation, while **Occasion** loops make special nights out
  easy without an automatic next turn.
- Occasion owners make the first picks and set the first meal time. Once an
  Occasion is completed, any crew member may start the next one and becomes
  that night's picker.
- Existing loops remain Standing exactly as before.
- When an existing Lunch Loop user joins either kind of new loop, their own
  restaurant additions are copied as clean place details only. Activity stays
  private to its original loop, and Google Place ID deduplication preserves the
  first new member's added-by credit.

- The canonical address is [lunchloop.app](https://lunchloop.app); old Vercel
  links redirect there.
- Google sign-in, owner-managed crew invitations, one-time short codes, and
  invitations to start an independent loop are live.
- Every loop has a separate database, home area, 1–35-mile search radius, and
  owner-editable time zone.
- Owners can manage people, invitations, restaurant cleanup, export/archive/
  transfer, search area, and Discord in Settings.
- The Lunch Database uses the shared six-at-a-time browser with search, filters,
  sorts, place facts, Google map, and directions.
- Selection supports manual search, filters, smart fill, availability checks,
  editing before the first veto, one veto per eligible member, and closing only
  after the scheduled time.
- Restaurant panels consistently show contributor, picks, vetoes, last visit,
  hours, map, and directions.
- The PWA has orange icons, installation guidance, and refresh behavior.
- Signed-in Feedback and Global Admin make bugs and feature ideas actionable.
- Private pages redirect anonymous visitors to sign-in; Places routes enforce
  same-origin signed-in requests and durable limits.
- Privacy Policy and Terms are published and linked throughout the app.
- Settings uses the orange Lunch Loop visual language, clearer section icons,
  and a calmer invitation panel. Legal links remain in the app footer.
- Safari receives a versioned SVG favicon plus refreshed ICO/PNG fallbacks.
- Global Admin can search users by full name or email before assigning access,
  and can permanently remove test loops after an exact-name confirmation.
- Cold starts now load the home view through one scoped database snapshot rather
  than a multi-query waterfall. Supabase session restoration gets short silent
  retries, and a friendly retry action replaces the false alarm that could
  appear just after a browser restart.
- Settings now reuses its initial loop lookup and loads owner-only invitation
  and Discord controls in parallel. Global Admin waits for a restored client
  session and retries a transient authorization lookup before ever showing the
  access-required state.
- Permanent Lunch Loop deletion now uses an in-app confirmation dialog with
  exact-name validation, progress, and a visible success or error result.
- Fixed permanent deletion for loops with historical restaurant choices: the
  database now removes session candidates and vetoes through their sessions
  before removing restaurants and the group itself. This path has a complete
  local regression fixture under `supabase/tests/`.
- Signed-in people without a Lunch Loop now receive a dedicated early-access
  welcome screen instead of dashboard navigation or a misleading load error.
  They can request access, see their request status, or enter a crew’s private
  one-time code from the same screen.
- Removed redundant install prompts, clarified the landing-page rule, moved
  Refresh after Settings, aligned the signed-in phone-install card, and placed
  navigation before the footer. Build-by-build public notes now live at
  `/whats-new`; signed-in Feedback now appears once, next to What’s New in the footer.

## Sharing with friends

Send friends to [lunchloop.app](https://lunchloop.app). A signed-in person
without an active loop can create their first private Lunch Loop. Owners invite
people into an existing loop from Settings; an invitation remains required to
join someone else’s private crew.
