export type ThemePreference = "system" | "light" | "dark";

export function asThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  const dark = preference === "dark" || (
    preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function storedThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  return asThemePreference(window.localStorage.getItem("lunch-loop-theme"));
}
