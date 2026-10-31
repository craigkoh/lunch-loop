import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { initialsFor } from "@/lib/initials";

type Person = { id: string; name: string };

function Dot({ person, tone }: { person: Person; tone: "pick" | "done" | "waiting" }) {
  return (
    <span
      title={person.name}
      className={cn(
        "-ml-2 grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ring-2 ring-[var(--ll-surface)] first:ml-0",
        tone === "pick" && "bg-accent text-white",
        tone === "done" && "bg-[var(--ll-text)] text-[var(--ll-bg)]",
        tone === "waiting" && "bg-stone-200 text-stone-700",
      )}
    >
      {initialsFor(person.name)}
    </span>
  );
}

/**
 * The round progress line with initials (build .76). People wait on the left
 * and move to the finish on the right; the orange fill grows one share per
 * person. Positions come from roundPositions() in src/lib/round-progress.ts.
 */
export function RoundTrack({
  people,
  suggesterId,
  done,
  waiting,
  share,
  startLabel,
  endLabel,
  caption,
  label,
  className,
}: {
  people: Person[];
  suggesterId?: string | null;
  done: string[];
  waiting: string[];
  share: number;
  startLabel: string;
  endLabel: string;
  caption?: ReactNode;
  label: string;
  className?: string;
}) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const list = (ids: string[]) => ids.map((id) => byId.get(id)).filter((person): person is Person => Boolean(person));
  const doneNames = list(done).map((person) => person.name);
  const waitingNames = list(waiting).map((person) => person.name);
  const percent = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${doneNames.length ? `At the finish: ${doneNames.join(", ")}.` : ""}${waitingNames.length ? ` Waiting: ${waitingNames.join(", ")}.` : ""}`.trim()}
        className="relative h-11"
      >
        <span aria-hidden="true" className="dark-track absolute inset-x-0 top-[19px] h-1 rounded-full bg-stone-200" />
        <span aria-hidden="true" className="absolute left-0 top-[19px] h-1 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
        <span aria-hidden="true" className="absolute left-0 top-1 flex">
          {list(waiting).map((person) => <Dot key={person.id} person={person} tone="waiting" />)}
        </span>
        <span aria-hidden="true" className="absolute right-0 top-1 flex">
          {list(done).map((person) => <Dot key={person.id} person={person} tone={person.id === suggesterId ? "pick" : "done"} />)}
        </span>
      </div>
      <p aria-hidden="true" className="mt-1 flex justify-between text-sm text-muted">
        <span>{startLabel}</span>
        <span>🏁 {endLabel}</span>
      </p>
      {caption ? <p className="mt-2 text-[15px] leading-6 text-muted">{caption}</p> : null}
    </div>
  );
}
