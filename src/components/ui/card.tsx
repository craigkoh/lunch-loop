import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** White (dark: #1c1c1e) rounded surface with the soft card shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-[var(--ll-radius-lg)] bg-surface p-5 text-ink shadow-[var(--ll-shadow-card)]", className)} {...props} />;
}

/** A card holding one-line rows separated by hairlines. */
export function ListCard({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("divide-y divide-line overflow-hidden rounded-[var(--ll-radius-lg)] bg-surface text-ink shadow-[var(--ll-shadow-card)]", className)} {...props} />;
}

export function SectionTitle({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/** Page title block: small orange eyebrow, big title, one muted line. */
export function PageHeader({ eyebrow, title, children, className }: { eyebrow?: string; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6", className)}>
      {eyebrow && <p className="text-sm font-medium text-accent-strong">{eyebrow}</p>}
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">{title}</h1>
      {children && <div className="mt-2 max-w-xl text-[15px] leading-6 text-muted">{children}</div>}
    </header>
  );
}
