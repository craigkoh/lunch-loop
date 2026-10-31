import type { Metadata } from "next";
import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { OperatorCredit } from "@/components/quiet-donation-link";
import { donationUrl } from "@/lib/donation";
import { getDonationsEnabled } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Value for Value | Lunch Loop",
  description: "Lunch Loop is free. If it helped your crew decide lunch, you can send some value back.",
  openGraph: {
    title: "Value for Value | Lunch Loop",
    description: "Lunch Loop is free. If it helped your crew decide lunch, you can send some value back.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Lunch Loop — the fun lunch loop for 2–6 friends" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Value for Value | Lunch Loop",
    description: "Lunch Loop is free. If it helped your crew decide lunch, you can send some value back.",
    images: ["/twitter-image"],
  },
};

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const open = await getDonationsEnabled();
  return (
    <AppFrame>
      <article>
        <header className="mb-6">
          {open ? <p className="text-sm font-medium text-accent-strong">Fuel the loop</p> : null}
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Value for Value</h1>
        </header>
        {open ? <SupportOpen /> : <SupportClosed />}
        <div className="mt-6 text-center text-sm text-muted">
          <OperatorCredit />
        </div>
      </article>
    </AppFrame>
  );
}

function SupportClosed() {
  return (
    <div className="rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)] sm:p-8">
      <p className="text-[17px] leading-7">Support isn&apos;t open right now.</p>
      <p className="mt-3 text-[15px] leading-7 text-muted">
        Lunch Loop is still free. There are no ads and no paid restaurant placement.
      </p>
    </div>
  );
}

function SupportOpen() {
  return (
    <div className="space-y-7 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)] sm:p-8">
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">A lunch problem</h2>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          Craig Kohler built Lunch Loop to help friends decide where to eat lunch. The familiar loop was “you pick,” then another round of vetoes in the group chat. Lunch Loop gives a crew a shared list, a turn, and one veto each.
        </p>
      </section>
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">Built while learning</h2>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          Lunch Loop is Craig’s idea, brought to life with new tools while he learned along the way. It is still a small tool for real friend groups, not a restaurant advertiser. <Link href="/about" className="font-medium text-accent-strong">More about Craig →</Link>
        </p>
      </section>
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">What it takes to keep running</h2>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          Running Lunch Loop means paying for Google Places restaurant search, email sending, and hosting and the domain. Those costs are real. This page does not turn them into a price for your crew.
        </p>
      </section>
      <section>
        <h2 className="text-[19px] font-semibold tracking-tight">If you got value, return value</h2>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          There are no ads, no paid restaurant placement, and no paywall. Everything in Lunch Loop stays free. Value for value means you give what it was worth to you. A couple of bucks is plenty. If it wasn&apos;t worth anything, you don&apos;t owe anything.
        </p>
        <a
          href={donationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--ll-radius-md)] bg-accent-strong px-5 py-3 text-center text-[15px] font-semibold text-on-accent sm:w-auto"
        >
          Send some value back
        </a>
        <p className="mt-3 text-sm leading-6 text-subtle">Donations are not tax-deductible. Stripe handles the payment. Lunch Loop never sees your card number, and a donation does not change which restaurant is chosen.</p>
      </section>
    </div>
  );
}
