const DEFAULT_TIME_ZONE = "America/Chicago";

function safeTimeZone(timeZone?: string) {
  return timeZone || DEFAULT_TIME_ZONE;
}

function weekdayFor(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

function timeInZone(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: safeTimeZone(timeZone),
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function minutesFor(token: string, fallbackMeridiem?: string) {
  const match = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = (match[3] ?? fallbackMeridiem)?.toUpperCase();
  if (minute > 59 || hour > 23) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;
  }
  return hour * 60 + minute;
}

export function hoursForDate(hours?: string[] | null, date = new Date(), timeZone?: string) {
  if (!hours?.length) return undefined;
  const weekday = weekdayFor(date, timeZone);
  return hours.find((item) => item.startsWith(`${weekday}:`));
}

export function todaysHours(hours?: string[] | null, now = new Date(), timeZone?: string) {
  const entry = hoursForDate(hours, now, timeZone);
  const weekday = weekdayFor(now, timeZone);
  return entry?.replace(`${weekday}:`, "Today:");
}

export function hoursAtPlannedLunch(hours: string[] | null | undefined, lunchAt: Date, timeZone?: string) {
  const entry = hoursForDate(hours, lunchAt, timeZone);
  if (!entry) return { label: "Hours unavailable", isOpen: true, known: false };
  const separator = entry.indexOf(":");
  const weekday = separator >= 0 ? entry.slice(0, separator) : "Hours";
  const rawHours = separator >= 0 ? entry.slice(separator + 1).trim() : entry;
  const display = `${weekday}: ${rawHours}`;
  const normalized = rawHours.toLowerCase();
  if (normalized.includes("closed")) return { label: display, isOpen: false, known: true };
  if (normalized.includes("open 24 hours")) return { label: display, isOpen: true, known: true };

  const intervals = [...rawHours.matchAll(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/gi)];
  if (!intervals.length) return { label: display, isOpen: true, known: false };
  const lunchMinutes = timeInZone(lunchAt, timeZone);
  const isOpen = intervals.some((interval) => {
    const endMeridiem = interval[2].match(/\b(AM|PM)\b/i)?.[1];
    const start = minutesFor(interval[1], endMeridiem);
    const end = minutesFor(interval[2], interval[1].match(/\b(AM|PM)\b/i)?.[1]);
    if (start === null || end === null) return true;
    return end >= start ? lunchMinutes >= start && lunchMinutes < end : lunchMinutes >= start || lunchMinutes < end;
  });
  return { label: display, isOpen, known: true };
}
