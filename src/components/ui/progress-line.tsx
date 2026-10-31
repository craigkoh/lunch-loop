import { cn } from "@/lib/cn";

/**
 * The Picks → Vetoes → Winner pattern: one bar per step, filled up to the
 * current step. Also used for feedback (Received → Looking at it → Planned → Live).
 */
export function ProgressLine({ steps, current, label, className }: { steps: string[]; current: number; label?: string; className?: string }) {
  const reached = Math.max(0, Math.min(current, steps.length));
  return (
    <div className={className}>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-label={label ?? steps.join(" then ")}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={reached}
        aria-valuetext={reached > 0 ? steps[reached - 1] : "Not started"}
      >
        {steps.map((step, index) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full", index < reached ? "bg-accent" : "bg-stone-200 dark-track")} />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-1 text-xs text-muted">
        {steps.map((step, index) => (
          <span key={step} className={index === reached - 1 ? "font-semibold text-ink" : undefined}>
            {step}{index < steps.length - 1 ? " →" : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
