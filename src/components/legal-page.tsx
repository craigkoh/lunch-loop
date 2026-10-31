import type { ReactNode } from "react";
import { AppFrame } from "./app-frame";
import { FuelTheLoopLink, OperatorCredit } from "./quiet-donation-link";

/**
 * Privacy, Terms and What's New share the app frame (sidebar or tabs when signed
 * in, the slim brand header when signed out) so they look like every other page.
 */
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
    <AppFrame>
      <article>
        <header className="mb-6">
          <p className="text-sm font-medium text-accent-strong">{eyebrow}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">{title}</h1>
          <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
        </header>
        <div className="space-y-8 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)] sm:p-8">
          {children}
        </div>
        <div className="mt-6 space-y-1 text-center text-sm text-muted">
          <OperatorCredit />
          <FuelTheLoopLink />
        </div>
      </article>
    </AppFrame>
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
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-7 text-muted">
        {children}
      </div>
    </section>
  );
}
