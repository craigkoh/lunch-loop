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
        <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Account settings</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Your Lunch Loop account</h1>
        <p className="mt-2 max-w-3xl text-stone-600">Choose how Lunch Loop looks on this device.</p>
      </div>

      <section className="mt-6 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-700">Your experience</p>
        <h2 className="mt-1 text-xl font-black">Appearance</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Choose the look that feels right. System follows your phone or computer&apos;s appearance setting.</p>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Theme preference">
          {(["system", "light", "dark"] as ThemePreference[]).map((preference) => <button key={preference} type="button" disabled={busy || loading} onClick={() => void saveTheme(preference)} className={`rounded-xl px-4 py-3 text-sm font-black capitalize disabled:opacity-60 ${themePreference === preference ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-900"}`}>
            {preference === "system" ? "🖥️ System" : preference === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>)}
        </div>
      </section>

      {message && <p role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p>}
    </AppFrame>
  );
}
