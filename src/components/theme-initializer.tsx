"use client";

import { useEffect } from "react";
import { applyThemePreference, storedThemePreference } from "@/lib/theme-preference";

export function ThemeInitializer() {
  useEffect(() => {
    const applyStoredTheme = () => applyThemePreference(storedThemePreference());
    applyStoredTheme();

    const appearance = window.matchMedia("(prefers-color-scheme: dark)");
    const onAppearanceChange = () => {
      if (storedThemePreference() === "system") applyStoredTheme();
    };
    appearance.addEventListener("change", onAppearanceChange);
    return () => appearance.removeEventListener("change", onAppearanceChange);
  }, []);

  return null;
}
