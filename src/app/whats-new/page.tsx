import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "What’s New | Lunch Loop",
  description: "Build-by-build Lunch Loop release notes.",
  openGraph: {
    title: "What’s New | Lunch Loop",
    description: "Build-by-build Lunch Loop release notes.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Lunch Loop — the fun lunch loop for 2–6 friends" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "What’s New | Lunch Loop",
    description: "Build-by-build Lunch Loop release notes.",
    images: ["/twitter-image"],
  },
};

type ReleaseChange = string | { text: string; credit?: string };

function changeText(change: ReleaseChange) {
  if (typeof change === "string") return change;
  const credit = change.credit?.trim();
  // Only an opted-in feedback credit_name belongs in `credit`.
  return credit ? `${change.text} (reported by ${credit} — thanks!)` : change.text;
}

const releases: { build: string; changes: ReleaseChange[] }[] = [
  {
    build: "2026.10.26.68",
    changes: ["Added a quick human check to email sign-in to keep spam bots out."],
  },
  {
    build: "2026.10.23.67",
    changes: ["Fixed the home-screen app icon so phones show the new Lunch Loop logo."],
  },
  {
    build: "2026.10.23.66",
    changes: [
      "A cleaner app icon: the arrow is now one solid loop around the plate, and the knife looks like a knife. Re-add Lunch Loop to your home screen to see the new icon there.",
    ],
  },
  {
    build: "2026.10.23.65",
    changes: [
      "The app icon is now a plate with an arrow in the rim: the loop you come back to.",
    ],
  },
  {
    build: "2026.10.23.64",
    changes: [
      "On a wider screen, the thank-you sits beside the lunch result. On a phone it stays tucked under the pick.",
      "Invite links now show a Lunch Loop preview when a friend shares them.",
    ],
  },
  {
    build: "2026.10.23.63",
    changes: [
      "A finished lunch can show a paper receipt, a one-line thank-you, or a tip jar. Not now hides it for that pick, and all three stay hidden while support is turned off.",
      "The Value for Value page says a couple of bucks is plenty. The loop stays free either way.",
    ],
  },
  {
    build: "2026.10.23.61",
    changes: [
      "Lunch Loop has a new plate, fork, and knife icon. The footer says Lunch Loop is run by Craig Kohler.",
      "An optional “keep it running” chip-in can appear after a lunch is closed. It stays off until it is turned on, and it never changes which restaurant is chosen.",
    ],
  },
  {
    build: "2026.10.22.60",
    changes: [
      "You can now sign in with a one-time email link instead of Google. Feedback is easier to send, and you can choose to be thanked by name when your report ships.",
      "If an email sign-in link is invalid or expired, Lunch Loop says so on the sign-in page instead of leaving you on the home page unsigned-in.",
      "Starting your first Lunch Loop works without an invitation. If something you entered needs a change, the message says which part.",
      "City suggestions sit directly under the search-area field, including in Safari.",
    ],
  },
  {
    build: "2026.10.19.59",
    changes: [
      "Lookups between people, places, invitations, and meal decisions stay quick as a crew’s history grows.",
      "If Google sign-in does not finish, Lunch Loop brings you back to the sign-in page with a short message instead of opening the home page as if you were signed in.",
      "Invitation links created from a temporary preview address now open lunchloop.app.",
      "When something unexpected goes wrong, Lunch Loop shows a plain message instead of technical wording. Notes written for you, such as a full crew or an invitation problem, still appear as before.",
      "This build includes security updates for the site framework and its image tools.",
    ],
  },
  {
    build: "2026.10.01.58",
    changes: [
      "Selected restaurant cards now wrap long names, addresses, hours, and Lunch Loop facts cleanly on narrow iPhone screens, so every detail stays readable while making picks.",
    ],
  },
  {
    build: "2026.09.07.57",
    changes: [
      "What’s New now derives its Last updated date from the newest release, so the date stays in step with the release list.",
      "Global Admin overview cards now open focused reports instead of scrolling the dashboard, and the report closes when you are done.",
      "Replaced early ‘Most visited’ cards with a more useful New on the list fact while a Lunch Loop is still building its restaurant story.",
    ],
  },
  {
    build: "2026.09.07.56",
    changes: [
      "Crew changes are now fully locked while a meal decision is underway: people cannot be removed or reordered until that decision is finished or cancelled, and every Lunch Loop keeps at least two people.",
      "Pending email and shareable invitations reserve the same remaining crew spots—even when adding a friend from another Lunch Loop—so owners cannot accidentally over-invite a six-person Lunch Loop.",
      "A crew name now belongs only to that Lunch Loop. Renaming someone in one crew no longer changes their Google account name or how they appear in another Lunch Loop.",
    ],
  },
  {
    build: "2026.09.04.55",
    changes: [
      "Picker results now wrap long restaurant names and addresses so the Add button stays visible on narrow phone screens.",
      "Added a direct Google Maps search-and-add flow inside the restaurant picker. New places go only to the current loop’s Lunch Database, then are ready to choose without leaving the decision.",
    ],
  },
  {
    build: "2026.09.03.54",
    changes: [
      "Removed the raw technical personal-data download from Account settings and disabled it for signed-in browsers. It will return only after it is redesigned as a clear, friend-readable account export.",
    ],
  },
  {
    build: "2026.09.03.53",
    changes: [
      "Dark mode now follows the same palette on every route, including the app header, footer, navigation, install guide, and public pages. It also follows a System preference when your phone or computer changes appearance.",
    ],
  },
  {
    build: "2026.09.02.52",
    changes: [
      "Completed a site-wide dark-theme contrast pass: app chrome, cards, filters, form fields, feedback, and status treatments now use readable dark surfaces while the light theme stays exactly as it was.",
      "Account deletion is no longer shown or available for self-service while we review the experience. Account settings continues to offer appearance controls.",
    ],
  },
  {
    build: "2026.09.02.51",
    changes: [
      "Added Account settings beside Log out, with a saved System, Light, or Dark appearance choice.",
      "Signed-in members can download a personal account-data export and permanently delete their account after a clear typed confirmation. Shared crews and their history stay intact; sole owners transfer a shared crew first, and the only Global Admin must add another administrator first.",
      "Completed the dark-mode feedback request and added database-backed account-lifecycle regression coverage.",
    ],
  },
  {
    build: "2026.09.01.50",
    changes: [
      "Owners can prepare invitations anytime, while Lunch Loop now keeps the crew size fixed during an active or already-decided meal so the picks and vetoes remain fair.",
      "Added a database-enforced six-person crew limit to every joining path, including immediate additions of people known from another Lunch Loop.",
    ],
  },
  {
    build: "2026.09.01.49",
    changes: [
      "Feedback now closes the loop: when a submitted report is shipped, its author sees a friendly ‘What changed’ update in their personal feedback history.",
      "Global Admin keeps a separate internal implementation note and a reporter-visible update, so private triage details remain private.",
    ],
  },
  {
    build: "2026.09.01.48",
    changes: [
      "Fixed the place-search field in the pick flow so typed text is always dark and readable on its white background.",
      "Live refreshes now preserve an in-progress picker’s unsaved restaurant choices and a crew member’s unsaved date or time change. Saving remains explicit, while vetoes and other completed updates still appear live.",
    ],
  },
  {
    build: "2026.09.01.47",
    changes: [
      "Owners can create a separate shareable code and link for every currently open crew spot, instead of replacing one code at a time.",
      "Each shareable invite can have an optional private name so the owner can track who it was intended for; pending codes remain independently revocable.",
      "The existing email invitation path remains available and unchanged.",
    ],
  },
  {
    build: "2026.09.01.46",
    changes: [
      "Owners can now generate a short, shareable one-time code and a matching lunchloop.app link when they do not have a friend’s email address.",
      "Shareable codes use 60 bits of cryptographic randomness, are stored only as hashes, expire after 14 days, are single-use, respect the six-person crew cap, and can be revoked from Settings.",
      "Generating a fresh shareable code immediately invalidates the prior one for that Lunch Loop, so an owner can quickly retire a misplaced invite.",
    ],
  },
  {
    build: "2026.09.01.45",
    changes: [
      "Owners can now add people they already share another active Lunch Loop with directly from Settings—ideal for putting together an Occasion crew with a few familiar friends.",
      "Known members join right away, bring a fresh copy of places they personally added, receive a Lunch Loop email when available, and see an in-app ‘you’re now part of’ message with a one-tap loop switch on their next sign-in.",
      "The regular one-time email invitation remains available for anyone new to your Lunch Loops.",
    ],
  },
  {
    build: "2026.09.01.44",
    changes: [
      "Improved signed-in home recovery after a browser restart or stale token: Lunch Loop now refreshes a nearly expired session before loading the current crew and retries the snapshot once with a fresh token.",
    ],
  },
  {
    build: "2026.09.01.43",
    changes: [
      "Added a Global Admin-owned-loop limit that is enforced everywhere Lunch Loops are created, restored, or transferred; the initial site-wide limit is now four active loops per owner.",
      "Turned the Global Admin overview into clickable reports for Lunch Loops, people, restaurants, decisions in progress, and completed winning picks with a home-area filter.",
      "Replaced the black Global Admin growth panel and action treatment with Lunch Loop orange, and made Google profile names searchable and visible alongside display names and email addresses.",
    ],
  },
  {
    build: "2026.08.31.42",
    changes: [
      "Hardened the database so the two-owned-loop and six-person crew limits hold even when requests arrive at the same time.",
      "Tightened database and API access controls: anonymous visitors cannot call internal database functions or write to public tables.",
      "Made restaurant detail facts faster by loading shortlist and veto history in one secure request.",
    ],
  },
  {
    build: "2026.08.31.41",
    changes: [
      "Made the Current Loop name in the global header open that loop’s home; My Lunch Loops remains the dedicated switcher.",
      "Removed the redundant Settings button from the global header. Global admins now see Global admin there instead, while loop settings remain under the selected loop.",
      "Added bounded loading, a visible Try again action, and a Refresh page option when the home snapshot is slow or fails to load.",
      "Fixed the fallback getting-started checklist.",
    ],
  },
  {
    build: "2026.08.31.40",
    changes: [
      "Made every active Lunch Loop card a destination: tap the current one to open it, or tap another one to switch into it.",
      "Made the current loop name at the top of My Lunch Loops open that loop too.",
      "Replaced the unclear Restaurant Database fact with a simple crew-size summary.",
    ],
  },
  {
    build: "2026.08.31.39",
    changes: [
      "Redesigned My Lunch Loops around a first-class Switch Lunch Loops chooser: every active crew is immediately visible, with one direct Use this loop action.",
      "Removed switching from the selected loop’s details card, so that card now focuses only on the restaurant database and settings for the current crew.",
      "Renamed the global Current Loop action from Change to My Lunch Loops.",
      "Moved archived loops into their own quieter management section.",
    ],
  },
  {
    build: "2026.08.31.38",
    changes: [
      "Rebuilt Add a Lunch Loop as a full-width app section instead of a narrow setup card.",
      "Made its copy work whether you are starting your first crew or another one—no more invitation-only wording or “create my private Lunch Loop.”",
      "Removed the redundant in-page Back and Settings row; the regular app header, Current Loop strip, navigation, and footer now carry the route context.",
      "Standardized the crowned 👑 Owner badge in the Current Loop strip, My Lunch Loops, and Settings.",
    ],
  },
  {
    build: "2026.08.31.37",
    changes: [
      "Replaced the internal-sounding “Working in” label with a simple Current Loop trail, including clear Standing or Occasion and Owner badges.",
      "Moved Create a Lunch Loop into the top-level My Lunch Loops actions instead of nesting it inside a current-loop card.",
      "A signed-in person without a Lunch Loop can now create their first private crew directly. Joining someone else’s crew still requires that owner’s private one-time invitation.",
      "Simplified the landing and no-loop experience around the two clear choices: create your own crew or join an invited crew.",
    ],
  },
  {
    build: "2026.08.31.36",
    changes: [
      "Made the active Lunch Loop unmistakable throughout the signed-in app with a persistent context trail that names the crew and whether it is a Standing or Occasion loop.",
      "Redesigned My Lunch Loops to lead with the current crew, clearly explain both loop types, and put changing or adding a private loop in the same first action area.",
      "Starting an additional loop now has the regular app header, navigation, footer, and a clear Back to My Lunch Loops path.",
      "Replaced the everyday black action buttons in the main join, sign-in, setup, and decision flow with Lunch Loop orange.",
    ],
  },
  {
    build: "2026.08.31.35",
    changes: [
      "Clarified Occasion onboarding: the owner sees that their own restaurant additions were copied as fresh place details, while activity remains in the original loops.",
    ],
  },
  {
    build: "2026.08.31.34",
    changes: [
      "Added Standing and Occasion Lunch Loops: recurring crews keep their picker rotation, while special nights out do not automatically hand off.",
      "Occasion owners make the first picks; after a completed occasion, any crew member can start the next one and make that night’s picks.",
      "Existing Lunch Loop members now bring a clean copy of the restaurants they added when joining another loop, without sharing visits, vetoes, or never-again history.",
    ],
  },
  {
    build: "2026.08.31.33",
    changes: [
      "Moved Feedback beside What’s New in the footer, so signed-in members see one clear feedback link instead of two.",
    ],
  },
  {
    build: "2026.08.31.32",
    changes: [
      "Polished the landing, sign-in, header, footer, and navigation layout.",
      "Removed duplicate app-install calls to action and added this build-by-build update page.",
      "Moved refresh after Settings, added Feedback to the footer, and aligned the phone-install card with the page content.",
    ],
  },
  {
    build: "2026.08.31.31",
    changes: [
      "Added a cheerful early-access welcome screen for signed-in people who have not joined a Lunch Loop.",
      "They can request access, check request status, or enter a crew’s one-time invitation code without seeing private-app navigation.",
    ],
  },
  {
    build: "2026.08.31.30",
    changes: [
      "Fixed permanent deletion for loops with historical picks, candidates, vetoes, and restaurant records.",
      "Added a complete local regression test for the deletion workflow.",
    ],
  },
  {
    build: "2026.08.31.29",
    changes: [
      "Replaced the browser delete prompt with an in-app confirmation dialog that shows validation, progress, success, and errors.",
    ],
  },
  {
    build: "2026.08.31.28",
    changes: [
      "Settings reuses its first loop lookup and loads owner-only controls in parallel.",
      "Global Admin waits for a restored session before deciding whether someone has site-admin access.",
    ],
  },
  {
    build: "2026.08.31.27",
    changes: [
      "Home now uses one secure database snapshot instead of a multi-query waterfall.",
      "Cold browser and PWA starts quietly retry while a Supabase session reconnects.",
    ],
  },
  {
    build: "2026.08.30.26",
    changes: [
      "Expanded multi-loop controls, global administration, PWA icon handling, privacy links, and the shared restaurant workflow.",
    ],
  },
];

function releaseDate(build: string) {
  const [year, month, day] = build.split(".").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function WhatsNewPage() {
  return (
    <LegalPage
      eyebrow="Lunch Loop updates"
      title="What’s New"
      updated={releaseDate(releases[0].build)}
    >
      <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-6 text-stone-700">
        Every production build gets an entry here. This is the running story of
        what changed, what was fixed, and what is getting smoother.
      </p>
      {releases.map((release) => (
        <LegalSection key={release.build} title={`Build ${release.build}`}>
          <ul className="list-disc space-y-1 pl-5">
            {release.changes.map((change) => {
              const text = changeText(change);
              return <li key={text}>{text}</li>;
            })}
          </ul>
        </LegalSection>
      ))}
    </LegalPage>
  );
}
