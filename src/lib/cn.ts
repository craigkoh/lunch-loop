/** Join class names, skipping empty values (a tiny stand-in for clsx). */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
