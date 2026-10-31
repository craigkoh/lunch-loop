/** The one short line a place card shows: "🏆 2 wins" or "No wins yet". */
export function winsLine(count: number) {
  if (!count) return "No wins yet";
  return `🏆 ${count} ${count === 1 ? "win" : "wins"}`;
}
