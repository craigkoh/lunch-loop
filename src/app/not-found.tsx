import Link from "next/link";
import { AuthShell, authCardClass } from "@/components/ui/auth-shell";

export default function NotFound() {
  return (
    <AuthShell>
      <section className={authCardClass}>
        <p className="text-sm font-medium text-accent-strong">Page not found</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">This table’s empty</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">The page you followed doesn’t exist, or it moved.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-[var(--ll-radius-md)] bg-accent-strong px-4 text-[15px] font-semibold text-on-accent">
          Back to Lunch Loop
        </Link>
      </section>
    </AuthShell>
  );
}
