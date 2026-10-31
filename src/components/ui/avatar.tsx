import { cn } from "@/lib/cn";
import { initialsFor } from "@/lib/initials";

/** Initials in a neutral circle. Never an emoji (custom pictures are on the backlog). */
export function Avatar({ name, size = "md", highlight = false, className }: { name: string; size?: "sm" | "md" | "lg"; highlight?: boolean; className?: string }) {
  const sizes = { sm: "size-8 text-[12px]", md: "size-9 text-xs", lg: "size-12 text-sm" };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        highlight ? "bg-accent text-white" : "bg-stone-200 text-stone-700",
        sizes[size],
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
