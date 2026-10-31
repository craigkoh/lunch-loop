"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { Avatar } from "./ui/avatar";
import { appInfo } from "@/lib/app-info";
import { cn } from "@/lib/cn";
import { fuelLinkLabel } from "@/lib/donation";
import { dismissFeedbackPrompt, feedbackPromptOpenFor } from "@/lib/feedback-prompt";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { getMyLunchLoops, type LunchLoopSummary } from "@/lib/supabase/group";
import { applyThemePreference, asThemePreference, storedThemePreference } from "@/lib/theme-preference";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

/** Phone tab bar and sidebar share this list. Add place lives inside Places. */
const tabs = [
  { href: "/", label: "Home", icon: "⌂", match: (path: string) => path === "/" },
  { href: "/database", label: "Places", icon: "☰", match: (path: string) => path.startsWith("/database") || path.startsWith("/add-place") },
  { href: "/history", label: "History", icon: "◷", match: (path: string) => path.startsWith("/history") },
  { href: "/stats", label: "Stats", icon: "▥", match: (path: string) => path.startsWith("/stats") },
];
const installCardKey = "lunch-loop-install-card-dismissed";
type MembershipNotification = {
  id: string;
  group_id: string;
  group_name: string;
  created_at: string;
};

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [account, setAccount] = useState("");
  const [userId, setUserId] = useState("");
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [loops, setLoops] = useState<LunchLoopSummary[]>([]);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [donationsEnabled, setDonationsEnabled] = useState(false);
  const [membershipNotifications, setMembershipNotifications] = useState<MembershipNotification[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [showInstallCard, setShowInstallCard] = useState(false);
  const headerLoadInFlight = useRef(false);
  const userIdRef = useRef("");
  userIdRef.current = userId;
  const currentLoop = loops.find((loop) => loop.active) ?? loops.find((loop) => loop.status === "active") ?? null;

  useEffect(() => {
    function refreshFeedbackPrompt() {
      const id = userIdRef.current;
      if (id && feedbackPromptOpenFor(id)) setFeedbackPromptOpen(true);
    }
    window.addEventListener("lunch-loop-feedback-prompt", refreshFeedbackPrompt);
    return () => window.removeEventListener("lunch-loop-feedback-prompt", refreshFeedbackPrompt);
  }, []);

  const loadHeader = useCallback(async () => {
    if (!hasSupabaseEnv() || headerLoadInFlight.current) return;
    headerLoadInFlight.current = true;
    const supabase = createClient();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      setAccount(user ? user.user_metadata.full_name || user.user_metadata.name || user.email?.split("@")[0] || "Lunch friend" : "");
      setUserId(user?.id ?? "");
      setFeedbackPromptOpen(Boolean(user && feedbackPromptOpenFor(user.id)));
      if (!user) {
        setLoops([]);
        setIsGlobalAdmin(false);
        setMembershipNotifications([]);
        return;
      }
      const [loopsResult, admin, notifications, theme, donations] = await Promise.allSettled([
        getMyLunchLoops(),
        supabase.rpc("is_site_admin"),
        supabase.rpc("get_my_lunch_loop_member_notifications"),
        supabase.rpc("get_my_lunch_theme_preference"),
        supabase.rpc("get_donations_enabled"),
      ]);
      setLoops(loopsResult.status === "fulfilled" ? loopsResult.value : []);
      setIsGlobalAdmin(admin.status === "fulfilled" && Boolean(admin.value.data));
      setMembershipNotifications(notifications.status === "fulfilled" ? ((notifications.value.data ?? []) as MembershipNotification[]) : []);
      setDonationsEnabled(donations.status === "fulfilled" && !donations.value.error && donations.value.data === true);
      if (theme.status === "fulfilled" && !theme.value.error) {
        const nextTheme = asThemePreference(theme.value.data);
        window.localStorage.setItem("lunch-loop-theme", nextTheme);
        applyThemePreference(nextTheme);
      }
    } finally {
      headerLoadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    applyThemePreference(storedThemePreference());
    void loadHeader();
    const { data: listener } = createClient().auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void loadHeader();
    });
    return () => listener.subscription.unsubscribe();
  }, [loadHeader]);
  useRefreshOnFocus(() => void loadHeader());

  useEffect(() => {
    // Phones only, never inside the installed app, and gone for good once dismissed.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShowInstallCard(!standalone && window.localStorage.getItem(installCardKey) !== "1");
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    setSwitcherOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen && !switcherOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSwitcherOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, switcherOpen]);

  function dismissInstallCard() {
    window.localStorage.setItem(installCardKey, "1");
    setShowInstallCard(false);
  }
  function dismissPrompt() {
    if (!userId) return;
    dismissFeedbackPrompt(userId);
    setFeedbackPromptOpen(false);
  }
  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }
  async function switchLoop(loop: LunchLoopSummary) {
    if (loop.active) {
      setSwitcherOpen(false);
      return;
    }
    const { error } = await createClient().rpc("set_active_lunch_loop", { target_group: loop.group_id });
    if (!error) window.location.assign("/");
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

  const feedbackHref = `/feedback?page=${encodeURIComponent(pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/")}`;
  const activeLoops = loops.filter((loop) => loop.status === "active");
  const loopName = currentLoop?.group_name ?? "Lunch Loop";
  const roleLine = currentLoop ? `${currentLoop.role === "owner" ? "Owner" : "Member"} of ${currentLoop.group_name}` : "Lunch Loop";

  const loopSwitcher = (placement: "header" | "sidebar") => (
    <div className={cn("relative min-w-0", placement === "sidebar" && "mt-5")}>
      <button
        type="button"
        onClick={() => setSwitcherOpen((open) => !open)}
        aria-expanded={switcherOpen}
        aria-haspopup="menu"
        className={cn(
          "flex min-w-0 max-w-full items-center gap-1 rounded-[var(--ll-radius-md)] text-left",
          placement === "sidebar" ? "w-full justify-between px-2 py-2 hover:bg-black/5" : "py-1 text-[15px] font-semibold",
        )}
      >
        {placement === "sidebar" ? (
          <span className="min-w-0">
            <span className="block text-[11px] text-subtle">Current loop</span>
            <span className="block truncate text-sm font-semibold">{loopName}</span>
          </span>
        ) : (
          <span className="truncate">{loopName}</span>
        )}
        <span className="shrink-0 text-subtle" aria-hidden="true">⌄</span>
      </button>
      {switcherOpen && (
        <div role="menu" className="absolute left-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-[var(--ll-radius-md)] bg-surface text-sm shadow-lg ring-1 ring-line">
          {activeLoops.map((loop) => (
            <button
              key={loop.group_id}
              role="menuitem"
              type="button"
              onClick={() => void switchLoop(loop)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-muted"
            >
              <span className="truncate">{loop.group_name}</span>
              {loop.active && <span className="text-accent-strong" aria-label="Current loop">✓</span>}
            </button>
          ))}
          <Link role="menuitem" href="/loops" className="block border-t border-line px-4 py-3 font-medium text-accent-strong hover:bg-surface-muted">
            My Lunch Loops
          </Link>
        </div>
      )}
    </div>
  );

  const menuRow = (href: string, label: string, extra?: ReactNode) => (
    <Link href={href} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-subtle">{extra}<span aria-hidden="true">›</span></span>
    </Link>
  );

  return (
    <div className="min-h-dvh bg-app text-ink md:flex">
      {account && (
        <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-line md:bg-surface/70 md:px-4 md:py-5">
          <Link href="/" className="flex items-center gap-2 px-2 font-semibold">
            <BrandMark className="size-8" />
            <span>Lunch Loop</span>
          </Link>
          {loopSwitcher("sidebar")}
          <nav aria-label="Primary" className="mt-4 grid gap-0.5 text-[15px]">
            {[...tabs, { href: "/report", label: "Loop report", icon: "❏", match: (path: string) => path.startsWith("/report") }].map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--ll-radius-md)] px-3 py-2",
                    active ? "bg-accent-soft font-semibold text-accent-strong" : "text-stone-600 hover:bg-black/5",
                  )}
                >
                  <span className="w-5 text-center" aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/add-place" className="mt-4 flex items-center justify-center gap-2 rounded-[var(--ll-radius-md)] bg-accent-strong px-3 py-2.5 text-sm font-semibold text-on-accent">
            ＋ Add place
          </Link>
          <div className="relative mt-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="account-menu"
              className="flex w-full items-center gap-3 rounded-[var(--ll-radius-md)] px-2 py-2 text-left hover:bg-black/5"
            >
              <Avatar name={account} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{account}</span>
                <span className="block truncate text-xs text-subtle">{currentLoop?.role === "owner" ? "Owner" : "Member"}</span>
              </span>
            </button>
            <FooterLine className="mt-3 px-2 text-left" />
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <header className={cn("sticky top-0 z-20 flex h-14 items-center gap-3 bg-app/85 px-4 backdrop-blur", account && "md:hidden")}>
          <Link href="/" aria-label="Lunch Loop home" className="flex shrink-0 items-center gap-2 font-semibold">
            <BrandMark className="size-8" />
            {!account && <span>Lunch Loop</span>}
          </Link>
          {account && loopSwitcher("header")}
          {account && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="account-menu"
              aria-label="Open menu"
              className="ml-auto rounded-full"
            >
              <Avatar name={account} />
            </button>
          )}
        </header>

        <main className={cn("mx-auto w-full max-w-3xl px-5 pt-3 md:px-10 md:pb-10 md:pt-10", account ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-10")}>
          {account && feedbackPromptOpen && pathname !== "/feedback" && (
            <Notice>
              <p>How did that decision go? A short note helps the next build.</p>
              <div className="flex items-center gap-4">
                <Link href={feedbackHref} onClick={dismissPrompt} className="font-semibold text-accent-strong">Share feedback</Link>
                <button type="button" onClick={dismissPrompt} className="text-subtle">Not now</button>
              </div>
            </Notice>
          )}
          {account && membershipNotifications.map((notification) => (
            <Notice key={notification.id}>
              <p><strong className="font-semibold">🎉 You’re now part of {notification.group_name}.</strong> It’s ready in your Lunch Loops.</p>
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => void openNewLoop(notification)} className="font-semibold text-accent-strong">Open it</button>
                <button type="button" onClick={() => void dismissMembershipNotification(notification)} className="text-subtle">Dismiss</button>
              </div>
            </Notice>
          ))}
          {children}
          {account && showInstallCard && (
            <aside className="mt-8 flex items-center gap-4 rounded-[var(--ll-radius-lg)] bg-surface p-4 shadow-[var(--ll-shadow-card)] md:hidden">
              <BrandMark className="size-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Put Lunch Loop on your phone</p>
                <p className="text-sm text-muted">One tap away when a lunch idea hits.</p>
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <Link href="/install" className="font-semibold text-accent-strong">Install app</Link>
                  <button type="button" onClick={dismissInstallCard} className="text-subtle">Not now</button>
                </div>
              </div>
            </aside>
          )}
          <FooterLine className={cn("mt-10 text-center", account && "md:hidden")} />
        </main>
      </div>

      {account && (
        <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/85 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 text-[10px] font-medium">
            {tabs.map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5", active ? "text-accent-strong" : "text-subtle")}
                >
                  <span className="text-xl leading-6" aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {account && menuOpen && (
        <div className="fixed inset-0 z-40" id="account-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-[var(--ll-overlay)]" onClick={() => setMenuOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[var(--ll-radius-sheet)] bg-app px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 md:inset-x-auto md:bottom-6 md:left-6 md:w-80 md:rounded-[var(--ll-radius-sheet)] md:pb-4 md:shadow-xl"
          >
            <div className="mx-auto h-1 w-9 rounded-full bg-stone-300 md:hidden" />
            <div className="mt-4 flex items-center gap-3 px-1">
              <Avatar name={account} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{account}</p>
                <p className="truncate text-sm text-muted">{roleLine}</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-line overflow-hidden rounded-[16px] bg-surface text-[15px] shadow-[var(--ll-shadow-card)]">
              {menuRow("/loops", "My Lunch Loops")}
              {currentLoop && menuRow("/settings", "Loop settings")}
              {currentLoop && menuRow("/report", "Loop report")}
            </div>
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-[16px] bg-surface text-[15px] shadow-[var(--ll-shadow-card)]">
              {menuRow("/account", "Account")}
              {menuRow(feedbackHref, "Feedback")}
              {menuRow("/whats-new", "What’s New")}
              {donationsEnabled && menuRow("/support", fuelLinkLabel, <span className="text-xs">optional tip</span>)}
            </div>
            {isGlobalAdmin && (
              <>
                <p className="mt-4 px-4 text-xs font-semibold text-subtle">Admin</p>
                <div className="mt-1 divide-y divide-line overflow-hidden rounded-[16px] bg-surface text-[15px] shadow-[var(--ll-shadow-card)]">
                  {menuRow("/global-admin", "Global admin", <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">Site admin</span>)}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 flex min-h-12 w-full items-center rounded-[16px] bg-surface px-4 py-3 text-left text-[15px] text-danger shadow-[var(--ll-shadow-card)]"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ll-radius-lg)] bg-surface px-4 py-3 text-sm shadow-[var(--ll-shadow-card)]">
      {children}
    </div>
  );
}

/** The one-line footer: Build · Privacy · Terms. */
export function FooterLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-subtle", className)}>
      <Link href="/whats-new" className="hover:text-ink">Build {appInfo.build}</Link>
      {" · "}
      <Link href="/privacy" className="hover:text-ink">Privacy</Link>
      {" · "}
      <Link href="/terms" className="hover:text-ink">Terms</Link>
    </p>
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
    <div className="rounded-[var(--ll-radius-lg)] bg-surface px-6 py-12 text-center shadow-[var(--ll-shadow-card)]">
      <div className="text-4xl">{emoji}</div>
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-muted">{children}</div>
    </div>
  );
}
