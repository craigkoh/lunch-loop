/**
 * Dismissible milestone cards, computed from existing loop data
 * (get_my_loop_milestone_facts). Pure functions so they are easy to test.
 */

export type MilestoneFacts = {
  group_created_at: string | null;
  completed_count: number;
  nth_lunch_at: Record<string, string>;
  latest: {
    session_id: string;
    at: string;
    restaurant_id: string | null;
    restaurant_name: string | null;
    restaurant_wins: number;
  } | null;
  members: { user_id: string; name: string; joined_at: string; first_lunch_session_id: string | null }[];
  dismissed: string[];
};

export type Milestone = {
  key: string;
  emoji: string;
  title: string;
  body: string;
};

const DAY = 86_400_000;
/** How long a milestone stays on Home after it happens. */
export const milestoneWindowDays = 14;
export const lunchMilestones = [10, 25, 50, 100] as const;

function ordinal(value: number) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th"}`;
}

function within(at: string | null | undefined, now: number, days = milestoneWindowDays) {
  if (!at) return false;
  const time = Date.parse(at);
  return Number.isFinite(time) && time <= now + DAY && now - time <= days * DAY;
}

/** Most recent loop anniversary (in whole years) on or before `now`, if any. */
export function lastAnniversary(createdAt: string | null | undefined, now: number) {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const today = new Date(now);
  let years = today.getUTCFullYear() - created.getUTCFullYear();
  const thisYear = new Date(Date.UTC(created.getUTCFullYear() + years, created.getUTCMonth(), created.getUTCDate()));
  if (thisYear.getTime() > now) years -= 1;
  if (years < 1) return null;
  const at = new Date(Date.UTC(created.getUTCFullYear() + years, created.getUTCMonth(), created.getUTCDate()));
  return { years, at: at.toISOString() };
}

/** Every milestone that is current and not dismissed, most special first. */
export function computeMilestones(facts: MilestoneFacts | null, viewerId: string, now = Date.now()): Milestone[] {
  if (!facts) return [];
  const dismissed = new Set(facts.dismissed ?? []);
  const found: Milestone[] = [];

  const anniversary = lastAnniversary(facts.group_created_at, now);
  if (anniversary && within(anniversary.at, now)) {
    found.push({
      key: `anniversary:${anniversary.years}`,
      emoji: "🎂",
      title: anniversary.years === 1 ? "One year of Lunch Loop!" : `${anniversary.years} years of Lunch Loop!`,
      body: "Happy loopiversary, crew. Here’s to many more lunches together.",
    });
  }

  for (const count of [...lunchMilestones].reverse()) {
    if (facts.completed_count >= count && within(facts.nth_lunch_at?.[String(count)], now)) {
      found.push({
        key: `lunches:${count}`,
        emoji: "🎉",
        title: `${ordinal(count)} lunch together!`,
        body: `Your loop just closed its ${ordinal(count)} lunch. Nice work, crew.`,
      });
      break;
    }
  }

  const latest = facts.latest;
  if (latest && within(latest.at, now, 7)) {
    const newcomers = facts.members.filter(
      (member) =>
        member.first_lunch_session_id === latest.session_id &&
        facts.group_created_at &&
        Date.parse(member.joined_at) - Date.parse(facts.group_created_at) > DAY,
    );
    for (const member of newcomers) {
      const you = member.user_id === viewerId;
      found.push({
        key: `first-lunch:${member.user_id}`,
        emoji: "👋",
        title: you ? "Your first lunch with the crew!" : `${member.name}’s first lunch with the crew!`,
        body: you ? "Welcome to the loop. Your picks are coming up soon." : "Say hi next time you’re at the table.",
      });
    }
    if (latest.restaurant_id && latest.restaurant_name && latest.restaurant_wins === 1 && facts.completed_count > 1) {
      found.push({
        key: `first-win:${latest.restaurant_id}`,
        emoji: "🏆",
        title: `${latest.restaurant_name} won for the first time!`,
        body: "A new name on the board.",
      });
    }
  }

  return found.filter((milestone) => !dismissed.has(milestone.key));
}
