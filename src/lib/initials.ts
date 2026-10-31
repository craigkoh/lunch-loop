/** "Craig Kohler" → "CK", "seth" → "S", "" → "?" */
export function initialsFor(name: string | null | undefined) {
  const words = (name ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** First word of a display name, for friendly lines. */
export function firstNameOf(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "Friend";
}
