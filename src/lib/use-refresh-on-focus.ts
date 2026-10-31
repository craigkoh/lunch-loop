"use client";

import { useEffect, useRef } from "react";

/**
 * Reload a screen's data when the tab or installed app comes back into view
 * (this replaced the header's Refresh button). Waits `minHiddenMs` so a quick
 * app switch does not refetch everything.
 */
export function useRefreshOnFocus(refresh: () => void, minHiddenMs = 15_000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let hiddenAt = 0;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= minHiddenMs) refreshRef.current();
      hiddenAt = 0;
    }
    function onFocus() {
      if (hiddenAt && Date.now() - hiddenAt >= minHiddenMs) {
        hiddenAt = 0;
        refreshRef.current();
      }
    }
    function onBlur() {
      if (!hiddenAt) hiddenAt = Date.now();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [minHiddenMs]);
}
