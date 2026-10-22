"use client";

import { useEffect } from "react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

/**
 * Supabase's default magic link can return tokens in the URL hash. The server
 * never sees a hash, so this browser finishes that session and clears it.
 */
export function AuthHashReturn() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const error = params.get("error");
    const errorCode = params.get("error_code");
    const errorDescription = params.get("error_description");
    if (!accessToken && !refreshToken && !error && !errorCode && !errorDescription) return;
    if (accessToken && refreshToken && hasSupabaseEnv()) {
      const supabase = createClient();
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(async ({ data }) => {
        if (data.session) await supabase.rpc("sync_my_lunch_profile");
        const next = new URL(window.location.pathname + window.location.search, window.location.origin);
        window.location.replace(data.session ? next.toString() : "/sign-in?error=link");
      });
      return;
    }
    const target = new URL("/auth/callback", window.location.origin);
    if (error) target.searchParams.set("error", error);
    if (errorCode) target.searchParams.set("error_code", errorCode);
    if (errorDescription) target.searchParams.set("error_description", errorDescription);
    window.location.replace(target.toString());
  }, []);
  return null;
}
