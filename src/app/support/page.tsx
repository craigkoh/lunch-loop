import type { Metadata } from "next";
import Link from "next/link";
import { OperatorCredit, FuelTheLoopLink } from "@/components/quiet-donation-link";
import { donationUrl } from "@/lib/donation";
import { getDonationsEnabled } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Value for Value | Lunch Loop",
  description: "Lunch Loop is free. If it helped your crew decide lunch, you can send some value back.",
};

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const open = await getDonationsEnabled();
  return (
    <main className="min-h-dvh bg-[#fffaf3] text-stone-900">
      <header className="border-b border-orange-100 bg-[#fffaf3]/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-black tracking-tight text-orange-950">
            <span className="grid size-10 place-items-center rounded-2xl bg-orange-500 text-xl shadow-sm">🍽️</span>
            <span>Lunch Loop</span>
          </Link>
          <Link href="/" className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-700 shadow-sm ring-1 ring-orange-100">
            Back to Lunch Loop
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {open ? (
          <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">Fuel the loop</p>
        ) : null}
        <h1 className={`text-4xl font-black tracking-tight text-orange-950 sm:text-5xl${open ? " mt-2" : ""}`}>
          Value for Value
        </h1>
        {open ? <SupportOpen /> : <SupportClosed />}
      </article>
      <footer className="border-t border-orange-100 px-4 py-8 text-center text-xs leading-5 text-stone-500">
        <p>© Craig Kohler · Lunch Loop</p>
        <OperatorCredit />
        <FuelTheLoopLink />
        <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <Link className="font-bold text-orange-700 underline" href="/privacy">Privacy Policy</Link>
          <Link className="font-bold text-orange-700 underline" href="/terms">Terms of Use</Link>
        </p>
      </footer>
    </main>
  );
}

function SupportClosed() {
  return (
    <div className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 sm:p-8">
      <p className="text-lg leading-8 text-stone-700">Support isn&apos;t open right now.</p>
      <p className="mt-3 text-base leading-7 text-stone-600">
        Lunch Loop is still free. There are no ads and no paid restaurant placement.
      </p>
    </div>
  );
}

function SupportOpen() {
  return (
    <div className="mt-8 space-y-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 sm:p-8">
      <section>
        <h2 className="text-xl font-black text-orange-950">A lunch problem</h2>
        <p className="mt-2 text-base leading-7 text-stone-700">
          Craig Kohler built Lunch Loop to help friends decide where to eat lunch. The familiar loop was “you pick,” then another round of vetoes in the group chat. Lunch Loop gives a crew a shared list, a turn, and one veto each.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-black text-orange-950">Built while learning</h2>
        <p className="mt-2 text-base leading-7 text-stone-700">
          Craig learned to build the software with AI coding tools. The product is still a small tool for real friend groups, not a restaurant advertiser.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-black text-orange-950">What it takes to keep running</h2>
        <p className="mt-2 text-base leading-7 text-stone-700">
          Running Lunch Loop means paying for Google Places restaurant search, email sending, and hosting and the domain. Those costs are real. This page does not turn them into a price for your crew.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-black text-orange-950">If you got value, return value</h2>
        <p className="mt-2 text-base leading-7 text-stone-700">
          There are no ads, no paid restaurant placement, and no paywall. Everything in Lunch Loop stays free. Value for value means you give what it was worth to you. A couple of bucks is plenty. If it wasn&apos;t worth anything, you don&apos;t owe anything.
        </p>
        <a
          href={donationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-center text-sm font-black text-white sm:w-auto"
        >
          Send some value back
        </a>
        <p className="mt-3 text-sm leading-6 text-stone-500">Donations are not tax-deductible. Stripe handles the payment. Lunch Loop never sees your card number, and a donation does not change which restaurant is chosen.</p>
      </section>
    </div>
  );
}
