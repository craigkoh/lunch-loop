import type { ReactNode } from "react";
import { AppFrame } from "../app-frame";
import { cn } from "@/lib/cn";

/** Sign-in and invitation pages: the app frame without loop navigation, one centered card. */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <AppFrame minimal>
      <div className={cn("mx-auto w-full pt-2 md:pt-6", wide ? "max-w-xl" : "max-w-md")}>{children}</div>
    </AppFrame>
  );
}

export const authCardClass = "rounded-[var(--ll-radius-lg)] bg-surface p-6 shadow-[var(--ll-shadow-card)] sm:p-8";
