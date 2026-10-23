import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Lunch Loop",
  description: "How Lunch Loop collects, uses, shares, and protects information.",
};

const updated = "October 23, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Your information" title="Privacy Policy" updated={updated}>
      <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-6 text-stone-700">
        This is the current Lunch Loop privacy policy. It is written for the
        private-crew service available at lunchloop.app and will be updated when
        our data practices change.
      </p>

      <LegalSection title="1. Who we are">
        <p>
          Lunch Loop is a meal-planning service operated by Craig Kohler
          (&ldquo;Lunch Loop,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Lunch Loop helps small,
          private groups take turns choosing a restaurant, record decisions,
          and maintain a shared restaurant database.
        </p>
        <p>
          For privacy questions, requests to access or delete information, or
          questions about this policy, email <a className="font-bold text-orange-700 underline" href="mailto:support@lunchloop.app">support@lunchloop.app</a>. Signed-in members may also use the Feedback link in Lunch Loop.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <p>We collect only information needed to operate Lunch Loop:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account information:</strong> your email address, display name, profile image URL when Google supplies one, authentication provider, and a technical account identifier. Email sign-in does not include a password. If Google does not supply a name, the display name starts as the part of your email address before the @ sign.</li>
          <li><strong>Lunch Loop information:</strong> the groups you join or own, member display names and order, invitations (including an optional owner-only name label for a shareable invite), restaurant entries, decisions, vetoes, planned meal times, notes, and feedback you submit. Feedback can include the page and app build. A public thank-you name is stored only if you check the credit box, and you can turn that credit off later.</li>
          <li><strong>Area information:</strong> a loop owner’s chosen city/area center, search radius, and time zone. Lunch Loop does not ask for or use your device’s precise GPS location.</li>
          <li><strong>Restaurant information:</strong> place names, addresses, maps, hours, ratings, phone numbers, categories, and place identifiers returned by Google Maps Platform when a member searches or adds a place.</li>
          <li><strong>Service and security information:</strong> limited request, device, browser, IP/log, and error information processed by the companies that host and protect Lunch Loop.</li>
          <li><strong>Optional communications:</strong> invitation email delivery information and, if a loop owner enables it, Discord webhook configuration and the chosen Lunch Loop event messages.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Sign-in: what we receive and what we do not">
        <p>You can sign in with Google or with a one-time link sent to an email address you enter. Lunch Loop does not collect or store a password.</p>
        <p>If you choose Google, we request the standard <code>openid</code>, <code>email</code>, and <code>profile</code> permissions. Through that sign-in, we receive basic profile information: your name, email address, profile-photo URL when Google provides one, and a technical account identifier. A profile photo is stored as a URL provided by Google; Lunch Loop does not upload or host a copy of that photo as its own file.</p>
        <p>If you choose an email link, Supabase Auth sends a single-use link to that address through Resend. We store the email address, a display name (the part before @ when no other name is available), and a technical account identifier. The link expires and works once. We do not receive the contents of your mailbox.</p>
        <p>We use that information to create and secure your Lunch Loop account, show who is participating in a loop, and let a loop owner tell members apart. An invitation addressed to a specific email must be accepted by an account signed in with that same address.</p>
        <p>Lunch Loop does <strong>not</strong> request or read your Gmail, Google Drive, Calendar, Contacts, Google Maps Timeline, or device location from Google.</p>
      </LegalSection>

      <LegalSection title="4. Cookies and browser storage">
        <p>Lunch Loop uses essential first-party authentication cookies from Supabase to keep you signed in and protect your session. We use ordinary browser caching for application files so the web app can load efficiently. This browser can also remember, only on this device, which optional support note was shown for a finished pick and whether you dismissed it. We do not use advertising cookies, cross-site tracking cookies, or third-party analytics trackers.</p>
      </LegalSection>

      <LegalSection title="5. How we use information">
        <p>We use this information to authenticate members; run the private group decision flow; search for and display restaurants; send invitations and optional notifications; provide exports, recovery, support, and feedback handling; prevent abuse; protect the service; and improve Lunch Loop.</p>
        <p>We do not sell personal information or use it for targeted advertising. We do not request payment-card information in Lunch Loop. An optional donation, when a site administrator turns it on, is offered on the Value for Value page and then opens Stripe in a new tab. Lunch Loop does not receive the card number, and a donation does not change restaurant selection or unlock features.</p>
      </LegalSection>

      <LegalSection title="6. Who can see information">
        <p>Lunch Loop is intentionally collaborative. Members of the same loop can see the group’s display names, restaurant list, picks, vetoes, history, and related statistics. The loop owner can also see member account email addresses and authentication-provider labels in Settings so they can manage invitations and the roster.</p>
        <p>Craig Kohler, as the service administrator, may access information when reasonably necessary to operate, secure, support, investigate abuse, or improve Lunch Loop. We do not make one group’s information available to another ordinary group.</p>
        <p>If you check “Credit me by name in release notes,” the name you enter may appear in public What’s New notes when that report ships, for example “Fixed X (reported by Sam — thanks!)”. Your email address is not published there. Leave the box unchecked and the thank-you stays private. You can withdraw the credit later from the feedback screen.</p>
      </LegalSection>

      <LegalSection title="7. Service providers and third parties">
        <p>We use trusted providers to run Lunch Loop:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Google:</strong> optional Google Sign-In, and Google Maps Platform, including Google Places and Google Maps.</li>
          <li><strong>Supabase:</strong> authentication (including one-time email links), database, and access-control services.</li>
          <li><strong>Vercel:</strong> application hosting, delivery, and operational logs.</li>
          <li><strong>Resend:</strong> invitation email, one-time sign-in links, and operational email when email delivery is enabled.</li>
          <li><strong>Maintainer feedback alerts:</strong> when the site switch is on, a new feedback report is sent to the operator’s notification bot. The alert includes the report, your display name, and a credit name only if you opted in. It does not include your email address. The destination address and access key stay in Supabase Vault and are not written into the app or this policy.</li>
          <li><strong>Discord:</strong> only when a loop owner voluntarily configures a Discord webhook.</li>
          <li><strong>Stripe:</strong> only if you choose to send value from the Value for Value page. Stripe processes that payment on its own page. Lunch Loop does not receive your card number. Donations are not tax-deductible.</li>
        </ul>
        <p>These providers process information under their own terms and privacy practices. We may also disclose information when required by law, to protect people or the service, or in connection with a business transfer.</p>
      </LegalSection>

      <LegalSection title="8. Google Maps Platform">
        <p>
          Lunch Loop uses Google Maps Platform to search for, display, and map
          restaurants. Your use of Google Maps features in Lunch Loop is also
          subject to the <a className="font-bold text-orange-700 underline" href="https://maps.google.com/policies/terms/" target="_blank" rel="noreferrer">Google Terms of Service</a>, the <a className="font-bold text-orange-700 underline" href="https://www.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps Additional Terms of Service</a>, and the <a className="font-bold text-orange-700 underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
        </p>
        <p>Google may receive information when you use Google Maps content, as described in Google’s policies. Google-provided restaurant information can change; we use and retain Google Maps Platform content subject to the applicable Google Maps Platform terms and policies.</p>
      </LegalSection>

      <LegalSection title="9. Discord notifications">
        <p>Discord is optional and is enabled only when a loop owner connects a Discord webhook. When enabled for a selected event, Lunch Loop sends that Discord channel the relevant group activity, which can include display names, loop name, restaurant name, the planned day/date/time, and pick, veto, winner, schedule-change, or next-turn details. Discord then processes that information under its own rules and privacy practices.</p>
        <p>The webhook URL is kept in Lunch Loop’s access-controlled database and is not shown back to the owner after it is saved. A loop owner can disconnect Discord at any time in Settings.</p>
      </LegalSection>

      <LegalSection title="10. Retention, leaving a loop, and deleting an account">
        <p>We keep account and active-loop information while it is needed to provide Lunch Loop. A loop owner can export, transfer, or archive a loop. Archived loops have a 30-day recovery window before permanent deletion becomes available. Invitations expire after 14 days unless they are accepted, revoked, or otherwise closed.</p>
        <p><strong>Leaving a loop is not the same as deleting an account.</strong> A member may ask the loop owner to remove them from a loop, or contact us for help. Removal ends future access to that loop, but past contributions—such as the display name attached to restaurant additions, picks, vetoes, and history—may remain in that loop’s historical record. Removing a member does not automatically delete their Lunch Loop account or information associated with other loops.</p>
        <p><strong>Personal-data export and account deletion are currently handled through support, not self-service buttons.</strong> To request account information or account deletion, email <a className="font-bold text-orange-700 underline" href="mailto:support@lunchloop.app">support@lunchloop.app</a>. Before processing a request, we will explain how it affects any solo-owned loops, shared loops, active decisions, and ownership responsibilities. We are reviewing a clear, friend-readable export and self-service deletion experience before making either available.</p>
        <p>Your feedback submissions are deleted with your account. We retain only basic security and usage records that are reasonably needed for support, safety, and service operations.</p>
      </LegalSection>

      <LegalSection title="11. Security">
        <p>We use account authentication, row-level database access controls, server-side API keys, rate limits, and operational safeguards designed to protect Lunch Loop. No online service is perfectly secure, so please protect the Google or email account you use to sign in, and do not share invitation links or one-time codes publicly.</p>
      </LegalSection>

      <LegalSection title="12. Children and international users">
        <p>Lunch Loop is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact us so we can take appropriate action.</p>
        <p>Lunch Loop is currently operated from the United States. If you use it from another country, your information may be processed in the United States and other places where our service providers operate.</p>
      </LegalSection>

      <LegalSection title="13. Changes to this policy">
        <p>We may update this policy when Lunch Loop changes. We will post the new effective date here and, when a change is material, provide additional notice in the app or by email when appropriate.</p>
      </LegalSection>
    </LegalPage>
  );
}
