export const donationUrl = "https://donate.stripe.com/aFafZg58yg91fKIdyZ53O00";
export const fuelLinkLabel = "Fuel the loop";

const storagePrefix = "lunch-loop-v4v-nudge:";
const quietMs = 3 * 24 * 60 * 60 * 1000;

export type PickNudgeRecord = {
  shownAt: number;
  sessionId: string;
  dismissed: boolean;
};

export function pickNudgeBucket(userId: string, sessionId: string) {
  let hash = 0;
  const text = `${userId}:${sessionId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash % 3;
}

/** Show on about one in three picks, and not again for three days, unless this same pick is still on screen. */
export function pickNudgeDecision(
  saved: PickNudgeRecord | null,
  userId: string,
  sessionId: string,
  now: number,
): "show" | "keep" | "hide" {
  if (saved?.sessionId === sessionId) return saved.dismissed ? "hide" : "keep";
  if (saved && now - saved.shownAt < quietMs) return "hide";
  if (pickNudgeBucket(userId, sessionId) !== 0) return "hide";
  return "show";
}

export function readPickNudge(userId: string): PickNudgeRecord | null {
  const raw = window.localStorage.getItem(storagePrefix + userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PickNudgeRecord>;
    if (typeof parsed.shownAt !== "number" || typeof parsed.sessionId !== "string") return null;
    return { shownAt: parsed.shownAt, sessionId: parsed.sessionId, dismissed: parsed.dismissed === true };
  } catch {
    return null;
  }
}

export function writePickNudge(userId: string, record: PickNudgeRecord) {
  window.localStorage.setItem(storagePrefix + userId, JSON.stringify(record));
}
