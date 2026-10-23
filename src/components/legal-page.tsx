import Link from "next/link";
import { OperatorCredit, QuietDonationLink } from "./quiet-donation-link";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#fffaf3] text-stone-900">
      <header className="border-b border-orange-100 bg-[#fffaf3]/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-black tracking-tight text-orange-950"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-orange-500 text-xl shadow-sm">
              🍽️
            </span>
            <span>Lunch Loop</span>
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-white px-3 py-2 text-sm font-black text-stone-700 shadow-sm ring-1 ring-orange-100"
          >
            Back to Lunch Loop
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-orange-950 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-stone-500">Last updated: {updated}</p>
        <div className="mt-8 space-y-7 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 sm:p-8">
          {children}
        </div>
      </article>
      <footer className="border-t border-orange-100 px-4 py-8 text-center text-xs leading-5 text-stone-500">
        <p>© Craig Kohler · Lunch Loop</p>
        <OperatorCredit />
        <QuietDonationLink />
        <p className="mt-2 flex justify-center gap-3">
          <Link className="font-bold text-orange-700 underline" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="font-bold text-orange-700 underline" href="/terms">
            Terms of Use
          </Link>
        </p>
      </footer>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-7 text-stone-700">
        {children}
      </div>
    </section>
  );
}
