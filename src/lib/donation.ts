export const donationUrl = "https://donate.stripe.com/aFafZg58yg91fKIdyZ53O00";
export const fuelLinkLabel = "Fuel the loop";

const storagePrefix = "lunch-loop-v4v-nudge:";

export const nudgeStyles = ["receipt", "line", "jar"] as const;
export type NudgeStyle = (typeof nudgeStyles)[number];

const nudgeWeights: Record<NudgeStyle, number> = {
  receipt: 2,
  line: 1,
  jar: 1,
};

export const receiptJokes = [
  "\"I don't care, you pick\"",
  "Group chat spiral",
  "Minutes of debate",
  "Coin-flip lunch",
  "\"Someone else choose\"",
  "One more option",
] as const;

export const oneLiners: { before: string; link: string; after: string }[] = [
  { before: "Lunch handled. If the loop gave you value, ", link: "send some back.", after: "" },
  { before: "The vetoes landed. ", link: "A thank-you can loop around", after: " whenever you want." },
  { before: "No ads in this meal. ", link: "Fuel the loop", after: " only if it earned it." },
  { before: "\"You pick\" lost today. ", link: "Value for value", after: ", if that felt good." },
  { before: "Decision served. ", link: "Give what it was worth", after: ", or nothing at all." },
  { before: "One place, one crew, zero paywall. ", link: "The rest is up to you.", after: "" },
  { before: "The group chat can stand down. ", link: "Send value back", after: " if you felt it." },
  { before: "Winner's on the card. ", link: "The loop stays free", after: " either way." },
];

export type PickNudgeRecord = {
  sessionId: string;
  dismissed: boolean;
  style: NudgeStyle | null;
  variant: number;
};

export type PickNudgeFacts = {
  loopName: string;
  restaurantName: string;
  pickedOn: string;
  memberCount: number;
  closedLunchCount: number;
  vetoCount: number;
};

export type ReceiptLine = {
  label: string;
  value: string;
  joke?: boolean;
};

export function hashNudge(userId: string, sessionId: string) {
  let hash = 0;
  const text = `${userId}:${sessionId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Weighted pick. Receipt is half, the other two split the rest. Never repeats the previous style. */
export function pickNudgeStyle(seed: number, previous: NudgeStyle | null): NudgeStyle {
  const pool = previous ? nudgeStyles.filter((style) => style !== previous) : [...nudgeStyles];
  const total = pool.reduce((sum, style) => sum + nudgeWeights[style], 0);
  let cursor = seed % total;
  for (const style of pool) {
    cursor -= nudgeWeights[style];
    if (cursor < 0) return style;
  }
  return pool[pool.length - 1];
}

export function receiptLines(facts: PickNudgeFacts, variant: number): ReceiptLine[] {
  const joke = receiptJokes[variant % receiptJokes.length];
  return [
    { label: "Crew members", value: String(facts.memberCount) },
    { label: "Lunches closed", value: String(facts.closedLunchCount) },
    { label: "Vetoes used", value: String(facts.vetoCount) },
    { label: joke, value: "VOID", joke: true },
    { label: "Ads shown", value: "0" },
    { label: "Paid placements", value: "0" },
  ];
}

export function decidePickNudge(
  saved: PickNudgeRecord | null,
  userId: string,
  sessionId: string,
): { visible: false } | { visible: true; style: NudgeStyle; variant: number } {
  if (saved?.sessionId === sessionId && saved.dismissed) return { visible: false };
  if (saved?.sessionId === sessionId && saved.style) {
    return { visible: true, style: saved.style, variant: saved.variant };
  }
  const seed = hashNudge(userId, sessionId);
  return {
    visible: true,
    style: pickNudgeStyle(seed, saved?.style ?? null),
    variant: seed % oneLiners.length,
  };
}

export function readPickNudge(userId: string): PickNudgeRecord | null {
  const raw = window.localStorage.getItem(storagePrefix + userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PickNudgeRecord>;
    if (typeof parsed.sessionId !== "string") return null;
    const style = nudgeStyles.includes(parsed.style as NudgeStyle) ? (parsed.style as NudgeStyle) : null;
    return {
      sessionId: parsed.sessionId,
      dismissed: parsed.dismissed === true,
      style,
      variant: typeof parsed.variant === "number" ? parsed.variant : 0,
    };
  } catch {
    return null;
  }
}

export function writePickNudge(userId: string, record: PickNudgeRecord) {
  window.localStorage.setItem(storagePrefix + userId, JSON.stringify(record));
}

export function receiptDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(value));
}
