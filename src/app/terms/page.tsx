import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use | Lunch Loop",
  description: "The terms that govern use of Lunch Loop.",
  openGraph: {
    title: "Terms of Use | Lunch Loop",
    description: "The terms that govern use of Lunch Loop.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Use | Lunch Loop",
    description: "The terms that govern use of Lunch Loop.",
  },
};

const updated = "October 23, 2026";

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Using Lunch Loop" title="Terms of Use" updated={updated}>
      <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-6 text-stone-700">
        These are the current Lunch Loop terms for the private-crew service at
        lunchloop.app. They are a practical set of rules for using the app and
        will be reviewed as the service grows.
      </p>

      <LegalSection title="1. Accepting these terms">
        <p>By creating an account, accepting an invitation, joining a Lunch Loop, or using the service, you agree to these Terms of Use and our <a className="font-bold text-orange-700 underline" href="/privacy">Privacy Policy</a>. If you do not agree, do not use Lunch Loop.</p>
        <p>You must be at least 13 years old and able to form a binding agreement where you live. If you use Lunch Loop for an organization, you represent that you have authority to accept these terms for it.</p>
      </LegalSection>

      <LegalSection title="2. Accounts, invitations, and loops">
        <p>You can sign in with Google or a one-time email link. Lunch Loop does not use passwords. Keep the Google or email account you use secure, and do not share it. An invitation sent to a specific email address must be accepted while signed in with that address. Invitations and short join codes are single-use and may expire; do not publish or misuse them.</p>
        <p>A signed-in person without an active Lunch Loop may create a loop and invite their crew. A Lunch Loop owner manages their loop’s roster, invitations, home search area, restaurant database, notifications, exports, ownership transfer, and archive choices. A loop is designed for 2–6 people. Each account may own up to the current site-wide active-loop limit, which is initially four and may change as the service grows.</p>
        <p>A member may ask the loop owner to remove them from a loop, or contact us for help. Removing someone from a loop ends future access but does not automatically delete their Lunch Loop account or erase the loop’s historical record. Self-service personal-data export and account deletion are currently unavailable while we review those workflows; contact <a className="font-bold text-orange-700 underline" href="mailto:support@lunchloop.app">support@lunchloop.app</a> for an information or deletion request. Owners may remove members, archive a loop, or transfer ownership. We may suspend or end access when necessary to protect the service, comply with law, or address abuse.</p>
      </LegalSection>

      <LegalSection title="3. Your content and group data">
        <p>You are responsible for the display names, restaurants, feedback, notes, and other content you submit. Do not submit unlawful, harmful, deceptive, infringing, or confidential information you do not have permission to share. If you opt in, the name you enter with feedback may be published in release notes. Leave that option off if you do not want a public thank-you, and you may withdraw it later.</p>
        <p>You keep ownership of your content. You grant Lunch Loop a limited right to host, process, display, and share it with the members of the relevant loop solely to operate and improve the service. Do not use Lunch Loop to scrape, copy, or build a public restaurant directory from third-party data.</p>
      </LegalSection>

      <LegalSection title="4. Restaurant information and Google Maps">
        <p>Restaurant information, hours, availability, ratings, maps, and directions are provided for convenience only. They may be incomplete, outdated, or wrong. Lunch Loop does not make reservations and does not guarantee a restaurant’s hours, food, price, accessibility, allergy safety, availability, or suitability. Confirm important details directly with the restaurant.</p>
        <p>Your use of Google Maps and Google Places features in Lunch Loop is subject to the <a className="font-bold text-orange-700 underline" href="https://maps.google.com/policies/terms/" target="_blank" rel="noreferrer">Google Terms of Service</a>, the <a className="font-bold text-orange-700 underline" href="https://www.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps Additional Terms of Service</a>, and the <a className="font-bold text-orange-700 underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>. Google Maps Platform attribution must remain intact.</p>
      </LegalSection>

      <LegalSection title="5. Optional third-party services">
        <p>Google Sign-In, one-time email links delivered through Supabase and Resend, Google Maps Platform, Vercel, and optional Discord notifications are provided by third parties. Their availability and policies are outside Lunch Loop’s control. A loop owner is responsible for using a Discord webhook only in a server and channel they are authorized to manage. When Discord notifications are enabled, selected decision events—including member display names, restaurant names, scheduled dates/times, and pick or veto activity—are copied to that Discord channel. Feedback alerts, when enabled, go to the operator’s notification bot and do not include the reporter’s email address.</p>
        <p>An optional donation, when the site switch is on, is voluntary. It is not a purchase, it does not unlock features or change restaurant selection, and it is not tax-deductible. Stripe processes it on Stripe’s own page. Lunch Loop stays free either way.</p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You may not interfere with Lunch Loop, bypass access controls or rate limits, probe for vulnerabilities, introduce malicious code, impersonate others, harvest data, use the service for spam or unlawful activity, or use Google Maps/Places content in a way that violates applicable Google terms.</p>
      </LegalSection>

      <LegalSection title="7. Service changes and availability">
        <p>Lunch Loop is provided as a private-crew service and may change, pause, or end as the service evolves. We may change features, limits, or these terms. We will post the new effective date here and give additional notice when a change is material.</p>
      </LegalSection>

      <LegalSection title="8. Disclaimers and limits of liability">
        <p>To the extent allowed by law, Lunch Loop is provided “as is” and “as available,” without warranties of any kind. We do not guarantee that the service will always be available, accurate, secure, or uninterrupted.</p>
        <p>To the extent allowed by law, Lunch Loop and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, goodwill, restaurant costs, or decisions made by a group. If liability cannot be excluded, it is limited to the greater of $25 or the amount you paid Lunch Loop in the 12 months before the event giving rise to the claim.</p>
      </LegalSection>

      <LegalSection title="9. Governing law and contact">
        <p>These terms are governed by the laws of Indiana, United States, without regard to conflict-of-law rules, except where your local law requires otherwise. Before starting a formal dispute, contact us at <a className="font-bold text-orange-700 underline" href="mailto:support@lunchloop.app">support@lunchloop.app</a> and allow a reasonable opportunity to help resolve the issue.</p>
      </LegalSection>
    </LegalPage>
  );
}
