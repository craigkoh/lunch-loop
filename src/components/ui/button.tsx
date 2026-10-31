import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ll-radius-md)] px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-accent-strong text-on-accent hover:opacity-90",
  secondary: "bg-surface text-ink ring-1 ring-line hover:bg-surface-muted",
  ghost: "text-accent-strong hover:bg-accent-soft",
  danger: "bg-danger-soft text-danger hover:opacity-90",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cn(base, variants[variant], className);
}

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
