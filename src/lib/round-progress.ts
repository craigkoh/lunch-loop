/**
 * Who sits where on the round progress line (build .76).
 *
 * The line runs from "Waiting" to the finish. The suggester reaches the finish
 * once their picks are in; everyone else moves there when they veto. When the
 * round is decided, the whole crew is at the finish.
 */
export type RoundPositionsInput = {
  memberIds: string[];
  suggesterId: string | null | undefined;
  vetoerIds: string[];
  picksMade: boolean;
  decided: boolean;
};

export type RoundPositions = {
  /** At the finish, suggester first, then in crew order. */
  done: string[];
  /** Still to go, in crew order (the suggester first while picking). */
  waiting: string[];
  /** 0 to 1, one share per person at the finish. */
  share: number;
};

export function roundPositions({ memberIds, suggesterId, vetoerIds, picksMade, decided }: RoundPositionsInput): RoundPositions {
  const members = [...new Set(memberIds)];
  if (!members.length) return { done: [], waiting: [], share: 0 };
  const suggester = suggesterId && members.includes(suggesterId) ? suggesterId : null;
  const others = members.filter((id) => id !== suggester);
  if (decided) {
    const done = suggester ? [suggester, ...others] : others;
    return { done, waiting: [], share: 1 };
  }
  const vetoed = new Set(vetoerIds);
  const done = [
    ...(suggester && picksMade ? [suggester] : []),
    ...others.filter((id) => vetoed.has(id)),
  ];
  const waiting = [
    ...(suggester && !picksMade ? [suggester] : []),
    ...others.filter((id) => !vetoed.has(id)),
  ];
  return { done, waiting, share: done.length / members.length };
}

/** "you", "you and Dana", "Dana, Mike, and you" style list. */
export function waitingOnText(names: string[]) {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
