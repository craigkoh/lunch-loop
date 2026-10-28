"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FeedbackBugLink } from "./feedback-bug-link";
import { BrandMark } from "./brand-mark";
import { FuelTheLoopLink, OperatorCredit } from "./quiet-donation-link";
import { appInfo } from "@/lib/app-info";
import { dismissFeedbackPrompt, feedbackPromptOpenFor } from "@/lib/feedback-prompt";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { getMyLunchLoops, type LunchLoopSummary } from "@/lib/supabase/group";
import { applyThemePreference, asThemePreference, storedThemePreference } from "@/lib/theme-preference";

const tabs = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/add-place", label: "Add Place", emoji: "➕" },
  { href: "/history", label: "History", emoji: "🗓️" },
  { href: "/stats", label: "Stats", emoji: "📊" },
];
const installCardKey = "lunch-loop-install-card-dismissed";
type MembershipNotification = {
  id: string;
  group_id: string;
  group_name: string;
  created_at: string;
};

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState("");
  const [userId, setUserId] = useState("");
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [currentLoop, setCurrentLoop] = useState<LunchLoopSummary | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [membershipNotifications, setMembershipNotifications] = useState<MembershipNotification[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showInstallCard, setShowInstallCard] = useState(false);
  const headerLoadInFlight = useRef(false);
  const userIdRef = useRef("");
  userIdRef.current = userId;
  useEffect(() => {
    function refreshFeedbackPrompt() {
      const id = userIdRef.current;
      if (id && feedbackPromptOpenFor(id)) setFeedbackPromptOpen(true);
    }
    window.addEventListener("lunch-loop-feedback-prompt", refreshFeedbackPrompt);
    return () => window.removeEventListener("lunch-loop-feedback-prompt", refreshFeedbackPrompt);
  }, []);
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    applyThemePreference(storedThemePreference());
    async function loadHeader() {
      if (headerLoadInFlight.current) return;
      headerLoadInFlight.current = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        setAccount(user ? user.user_metadata.full_name || user.user_metadata.name || user.email?.split("@")[0] || user.email || "Signed in" : "");
        setUserId(user?.id ?? "");
        setFeedbackPromptOpen(Boolean(user && feedbackPromptOpenFor(user.id)));
        if (user) {
          const adminRequest = supabase.rpc("is_site_admin");
          const notificationRequest = supabase.rpc("get_my_lunch_loop_member_notifications");
          const themeRequest = supabase.rpc("get_my_lunch_theme_preference");
          try {
            const loops = await getMyLunchLoops();
            setCurrentLoop(loops.find((loop) => loop.active) ?? loops.find((loop) => loop.status === "active") ?? null);
          } catch {
            setCurrentLoop(null);
          }
          try {
            const { data: isAdmin } = await adminRequest;
            setIsGlobalAdmin(Boolean(isAdmin));
          } catch {
            setIsGlobalAdmin(false);
          }
          try {
            const { data: notifications } = await notificationRequest;
            setMembershipNotifications((notifications ?? []) as MembershipNotification[]);
          } catch {
            setMembershipNotifications([]);
          }
          try {
            const { data: preference } = await themeRequest;
            const nextTheme = asThemePreference(preference);
            window.localStorage.setItem("lunch-loop-theme", nextTheme);
            applyThemePreference(nextTheme);
          } catch {
            // A browser-stored preference remains a safe visual fallback.
          }
        } else {
          setCurrentLoop(null);
          setIsGlobalAdmin(false);
          setMembershipNotifications([]);
          setFeedbackPromptOpen(false);
        }
      } finally {
        headerLoadInFlight.current = false;
      }
    }
    void loadHeader();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void loadHeader();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    // Phones only, never inside the installed app, and gone for good once dismissed.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissed = window.localStorage.getItem(installCardKey) === "1";
    setShowInstallCard(!standalone && !dismissed);
  }, []);
  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);
  function dismissInstallCard() {
    window.localStorage.setItem(installCardKey, "1");
    setShowInstallCard(false);
  }
  function dismissPrompt() {
    if (!userId) return;
    dismissFeedbackPrompt(userId);
    setFeedbackPromptOpen(false);
  }
  const feedbackPage = pathname || "/";
  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }
  async function openNewLoop(notification: MembershipNotification) {
    const supabase = createClient();
    const [{ error: switchError }, { error: dismissError }] = await Promise.all([
      supabase.rpc("set_active_lunch_loop", { target_group: notification.group_id }),
      supabase.rpc("dismiss_lunch_loop_member_notification", { target_notification: notification.id }),
    ]);
    if (switchError || dismissError) return;
    window.location.assign("/");
  }
  async function dismissMembershipNotification(notification: MembershipNotification) {
    const { error } = await createClient().rpc("dismiss_lunch_loop_member_notification", { target_notification: notification.id });
    if (!error) setMembershipNotifications((current) => current.filter((item) => item.id !== notification.id));
  }
  return (
    <div className="min-h-dvh bg-[#fffaf3] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-orange-100 bg-[#fffaf3]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-black tracking-tight text-orange-950"
          >
            <BrandMark className="size-9" />
            <span>Lunch Loop</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/add-place"
              className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white shadow-sm"
              aria-label="Add a place"
            >
              <span className="text-base leading-none">＋</span>
              <span>Add place</span>
            </Link>
            {isGlobalAdmin && <Link
              href="/global-admin"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-950 shadow-sm"
              aria-label="Global admin"
            >
              <span className="text-base leading-none" aria-hidden="true">🌐</span>
              <span className="hidden sm:inline">Global admin</span>
            </Link>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-700 shadow-sm ring-1 ring-stone-200"
              aria-label="Refresh the latest Lunch Loop information"
              title="Refresh the latest information"
            >
              <span className="text-base leading-none" aria-hidden="true">
                ↻
              </span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {account && (
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-700 shadow-sm ring-1 ring-stone-200 sm:hidden"
                aria-expanded={accountMenuOpen}
                aria-controls="phone-account-menu"
                aria-label="Account menu"
              >
                <span className="text-base leading-none" aria-hidden="true">☰</span>
              </button>
            )}
          </div>
        </div>
        {account && (
          <div className="mx-auto mt-2 hidden max-w-5xl flex-wrap items-center justify-end gap-2 text-xs text-stone-500 sm:flex">
            <FeedbackBugLink page={feedbackPage} />
            <span className="max-w-40 truncate">Signed in as {account}</span>
            <Link href="/account" className="font-bold text-orange-700 underline">
              Account settings
            </Link>
            <button
              onClick={() => void signOut()}
              className="font-bold text-orange-700 underline"
            >
              Log out
            </button>
          </div>
        )}
        {account && accountMenuOpen && (
          <div id="phone-account-menu" className="mx-auto mt-2 max-w-5xl rounded-2xl border border-orange-100 bg-white p-3 text-sm shadow-lg sm:hidden">
            <p className="truncate px-1 text-xs text-stone-500">Signed in as {account}</p>
            <div className="mt-2 grid gap-1">
              <Link href="/account" className="flex min-h-11 items-center rounded-xl px-3 font-black text-stone-800 hover:bg-orange-50">⚙️ Account settings</Link>
              <FeedbackBugLink page={feedbackPage} className="flex min-h-11 items-center rounded-xl px-3 font-black text-stone-800 hover:bg-orange-50" />
              <button type="button" onClick={() => void signOut()} className="flex min-h-11 items-center rounded-xl px-3 text-left font-black text-stone-800 hover:bg-orange-50">🚪 Log out</button>
            </div>
          </div>
        )}
        {account && currentLoop && (
          <div className="mx-auto mt-3 max-w-5xl border-t border-orange-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-stone-500">Current Loop</span>
              <span className="text-stone-300" aria-hidden="true">/</span>
              <Link href="/" className="max-w-[14rem] truncate font-black text-orange-800 underline decoration-orange-300 underline-offset-4 sm:max-w-xs" title="Open current Lunch Loop">
                {currentLoop.group_name}
              </Link>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-black text-orange-800">
                {currentLoop.loop_type === "occasion" ? "✨ Occasion" : "🔁 Standing"}
              </span>
              {currentLoop.role === "owner" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">
                  👑 Owner
                </span>
              )}
              <Link href="/loops" className="ml-auto text-xs font-black text-orange-700 underline">
                My Lunch Loops
              </Link>
            </div>
          </div>
        )}
        {account && feedbackPromptOpen && pathname !== "/feedback" && (
          <div className="mx-auto mt-3 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
              <p>How did that decision go? A short note helps the next build.</p>
              <div className="flex items-center gap-3">
                <FeedbackBugLink page={feedbackPage} onClick={dismissPrompt} className="font-black text-orange-800 underline" />
                <button type="button" onClick={dismissPrompt} className="text-xs font-bold text-stone-600 underline">Not now</button>
              </div>
            </div>
          </div>
        )}
        {account && membershipNotifications.length > 0 && (
          <div className="mx-auto mt-3 max-w-5xl space-y-2">
            {membershipNotifications.map((notification) => (
              <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                <p><strong>🎉 You’re now part of {notification.group_name}.</strong> It is ready in your Lunch Loops.</p>
                <div className="flex items-center gap-3"><button type="button" onClick={() => void openNewLoop(notification)} className="font-black text-orange-800 underline">Open it</button><button type="button" onClick={() => void dismissMembershipNotification(notification)} className="text-xs font-bold text-stone-600 underline">Dismiss</button></div>
              </div>
            ))}
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:px-6 md:pb-8">
        {children}
      </main>
      {account && showInstallCard && (
        <aside className="mx-auto mb-7 w-[calc(100%-2rem)] rounded-3xl border border-orange-100 bg-white px-5 py-4 shadow-sm md:hidden">
          <div>
            <p className="text-sm font-black">Put Lunch Loop on your phone</p>
            <p className="mt-1 text-sm text-stone-600">The orange icon is one tap away whenever a good lunch idea hits.</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Link href="/install" className="whitespace-nowrap rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white">📲 Install app</Link>
            <button type="button" onClick={dismissInstallCard} className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-stone-600 underline">Not now</button>
          </div>
        </aside>
      )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-orange-100 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:sticky md:bottom-0 md:mx-auto md:max-w-5xl md:rounded-t-2xl md:border-x"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-w-14 flex-col items-center rounded-xl px-2 py-1 text-[10px] font-bold transition ${active ? "bg-orange-100 text-orange-800" : "text-stone-500 hover:text-stone-800"}`}
              >
                <span className="text-lg leading-5">{tab.emoji}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <footer className="mx-auto max-w-5xl px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-5 text-center text-xs leading-5 text-stone-500 md:px-6 md:pb-5">
        <OperatorCredit />
        <FuelTheLoopLink />
        <p>
          © Craig Kohler · Lunch Loop · Build {appInfo.build} ·{" "}
          <Link href="/whats-new" className="font-bold text-orange-700 underline">
            What&apos;s New
          </Link>
          {account && (
            <>
              {" · "}
              <Link href="/feedback" className="font-bold text-orange-700 underline">
                Feedback
              </Link>
              {" · "}
              <Link href="/account" className="font-bold text-orange-700 underline">
                Account settings
              </Link>
            </>
          )}
        </p>
        <p>
          Last built {appInfo.builtOn} ·{" "}
          <a
            href="https://craigkohler.com"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-orange-700 underline"
          >
            craigkohler.com
          </a>
        </p>
        <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <Link href="/privacy" className="font-bold text-orange-700 underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="font-bold text-orange-700 underline">
            Terms of Use
          </Link>
        </p>
      </footer>
    </div>
  );
}

export function EmptyState({
  emoji = "🍽️",
  title,
  children,
}: {
  emoji?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-orange-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="text-4xl">{emoji}</div>
      <h2 className="mt-3 text-lg font-black">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-stone-500">{children}</div>
    </div>
  );
}
