export const donationUrl = "https://donate.stripe.com/aFafZg58yg91fKIdyZ53O00";
export const fuelLinkLabel = "Fuel the loop";
export const tipAskLabel = "Tip the loop ($1–3)";
export const tipFreeNote = "Lunch Loop is free. This is an optional tip.";

const storagePrefix = "lunch-loop-v4v-nudge:";

export const nudgeStyles = ["receipt", "line", "jar"] as const;
export type NudgeStyle = (typeof nudgeStyles)[number];

/** About 1 in 4 finished picks show no thank-you at all. */
export const nudgeSkipChance = 0.25;

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
  /** null means this pick rolled "show nothing". */
  style: NudgeStyle | null;
  variant: number;
  /** The last style actually shown, so a quiet pick does not reset the no-repeat rule. */
  lastShown: NudgeStyle | null;
};

/** Facts about this one lunch. Missing values are null and their receipt line is left off. */
export type PickNudgeFacts = {
  loopName: string;
  restaurantName: string;
  pickedOn: string;
  placesInRunning: number;
  vetoCount: number;
  decideMinutes: number | null;
  distanceMiles: number | null;
  visitNumber: number | null;
  daysSinceLastVisit: number | null;
  rating: number | null;
  cuisine: string | null;
  pickedBy: string | null;
};

export type ReceiptLine = {
  label: string;
  value: string;
};

/**
 * Truly random, decided once per lunch. About 1 in 4 shows nothing.
 * Otherwise receipt, one-liner, and tip jar have equal odds, never the
 * style shown last time.
 */
export function pickNudgeStyle(roll: number, previous: NudgeStyle | null): NudgeStyle | null {
  if (roll < nudgeSkipChance) return null;
  const pool = previous ? nudgeStyles.filter((style) => style !== previous) : [...nudgeStyles];
  const share = (roll - nudgeSkipChance) / (1 - nudgeSkipChance);
  return pool[Math.min(pool.length - 1, Math.floor(share * pool.length))];
}

export function formatDecideTime(minutes: number) {
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) {
    const whole = Math.floor(hours);
    const rest = Math.round(minutes - whole * 60);
    return rest ? `${whole} hr ${rest} min` : `${whole} hr`;
  }
  return `${Math.round(hours / 24)} days`;
}

export function milesBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

export function receiptLines(facts: PickNudgeFacts): ReceiptLine[] {
  const lines: (ReceiptLine | null)[] = [
    { label: "Places in the running", value: String(facts.placesInRunning) },
    { label: "Vetoes", value: String(facts.vetoCount) },
    facts.decideMinutes === null ? null : { label: "Time to decide", value: formatDecideTime(facts.decideMinutes) },
    facts.distanceMiles === null
      ? null
      : { label: "Distance", value: `${facts.distanceMiles < 10 ? facts.distanceMiles.toFixed(1) : Math.round(facts.distanceMiles)} mi` },
    facts.visitNumber === null
      ? null
      : { label: "Visit", value: facts.visitNumber <= 1 ? "First time" : `#${facts.visitNumber}` },
    facts.daysSinceLastVisit === null
      ? null
      : {
          label: "Since last visit",
          value: facts.daysSinceLastVisit < 1 ? "Same day" : `${facts.daysSinceLastVisit} ${facts.daysSinceLastVisit === 1 ? "day" : "days"}`,
        },
    facts.rating ? { label: "Rating", value: `${facts.rating.toFixed(1)} ★` } : null,
    facts.cuisine ? { label: "Cuisine", value: facts.cuisine } : null,
    facts.pickedBy ? { label: "Picked by", value: facts.pickedBy } : null,
    { label: "Ads shown", value: "0" },
  ];
  return lines.filter((line): line is ReceiptLine => line !== null);
}

export function decidePickNudge(
  saved: PickNudgeRecord | null,
  sessionId: string,
  random: () => number = Math.random,
): { visible: false; record: PickNudgeRecord | null } | { visible: true; style: NudgeStyle; variant: number; record: PickNudgeRecord | null } {
  if (saved?.sessionId === sessionId) {
    if (saved.dismissed || !saved.style) return { visible: false, record: null };
    return { visible: true, style: saved.style, variant: saved.variant, record: null };
  }
  const previous = saved?.lastShown ?? saved?.style ?? null;
  const style = pickNudgeStyle(random(), previous);
  const variant = Math.floor(random() * oneLiners.length);
  const record: PickNudgeRecord = { sessionId, dismissed: false, style, variant, lastShown: style ?? previous };
  return style ? { visible: true, style, variant, record } : { visible: false, record };
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
      lastShown: nudgeStyles.includes(parsed.lastShown as NudgeStyle) ? (parsed.lastShown as NudgeStyle) : style,
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
