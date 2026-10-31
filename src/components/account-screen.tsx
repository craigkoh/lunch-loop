"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "./app-frame";
import { createClient } from "@/lib/supabase/client";
import { applyThemePreference, asThemePreference, type ThemePreference } from "@/lib/theme-preference";

export function AccountScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error: themeError } = await createClient().rpc("get_my_lunch_theme_preference");
      if (themeError) throw themeError;
      const nextPreference = asThemePreference(data);
      setThemePreference(nextPreference);
      applyThemePreference(nextPreference);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Your account details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveTheme(preference: ThemePreference) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data, error: themeError } = await createClient().rpc("set_my_lunch_theme_preference", {
        new_preference: preference,
      });
      if (themeError) throw themeError;
      const nextPreference = asThemePreference(data);
      setThemePreference(nextPreference);
      localStorage.setItem("lunch-loop-theme", nextPreference);
      applyThemePreference(nextPreference);
      setMessage(`Theme set to ${nextPreference}.`);
    } catch (themeError) {
      setError(themeError instanceof Error ? themeError.message : "Your theme could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppFrame>
      <div>
        <p className="text-sm font-medium text-accent-strong">Account settings</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Your Lunch Loop account</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-6 text-muted">Choose how Lunch Loop looks on this device.</p>
      </div>

      <section className="mt-6 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
        <h2 className="text-[19px] font-semibold tracking-tight">Appearance</h2>
        <p className="mt-1 max-w-3xl text-[15px] leading-6 text-muted">Choose the look that feels right. System follows your phone or computer&apos;s appearance setting.</p>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Theme preference">
          {(["system", "light", "dark"] as ThemePreference[]).map((preference) => <button key={preference} type="button" disabled={busy || loading} onClick={() => void saveTheme(preference)} aria-pressed={themePreference === preference} className={`min-h-11 rounded-full border px-4 text-sm font-medium capitalize disabled:opacity-60 ${themePreference === preference ? "border-transparent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {preference === "system" ? "🖥️ System" : preference === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>)}
        </div>
      </section>

      {message && <p role="status" className="mt-5 rounded-[var(--ll-radius-md)] bg-surface p-4 text-[15px] text-ink shadow-[var(--ll-shadow-card)]">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-[var(--ll-radius-md)] bg-danger-soft p-4 text-[15px] text-danger">{error}</p>}
    </AppFrame>
  );
}
