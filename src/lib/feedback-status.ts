/**
 * Friendly feedback status for the person who sent it, shown as a progress
 * line: Received → Looking at it → Planned → Live. The database keeps its
 * original values (new, triaged, planned, in_progress, shipped, declined,
 * duplicate) so the webhook and Global Admin keep working.
 */
export const feedbackSteps = ["Received", "Looking at it", "Planned", "Live"] as const;

export type FeedbackStatus = "new" | "triaged" | "planned" | "in_progress" | "shipped" | "declined" | "duplicate";

/** Step number (1–4) on the progress line, or 0 when the item is closed without shipping. */
export function feedbackStep(status: string): number {
  switch (status) {
    case "new":
      return 1;
    case "triaged":
      return 2;
    case "planned":
    case "in_progress":
      return 3;
    case "shipped":
      return 4;
    default:
      return 0;
  }
}

export function feedbackStatusLabel(status: string): string {
  if (status === "declined") return "Not planned";
  if (status === "duplicate") return "Already on the list";
  if (status === "in_progress") return "Planned · being built";
  const step = feedbackStep(status);
  return step > 0 ? feedbackSteps[step - 1] : "Received";
}

/** Global Admin choices, in progress-line order, with the friendly label first. */
export const adminFeedbackStatusOptions: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "Received" },
  { value: "triaged", label: "Looking at it" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "Planned · being built" },
  { value: "shipped", label: "Live" },
  { value: "declined", label: "Not planned" },
  { value: "duplicate", label: "Already on the list" },
];
