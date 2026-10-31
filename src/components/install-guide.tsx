"use client";

import Link from "next/link";
import { AppFrame } from "./app-frame";
import { BrandMark } from "./brand-mark";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

type Platform = "iphone" | "android";

const steps: Record<
  Platform,
  { step: string; title: string; body: string; icon: string }[]
> = {
  iphone: [
    {
      step: "1",
      title: "Open Lunch Loop in Safari",
      body: "Use Safari on your iPhone or iPad. The Share button only appears in Safari.",
      icon: "🌐",
    },
    {
      step: "2",
      title: "Tap Share",
      body: "Tap the square with the up arrow at the bottom of Safari.",
      icon: "⤴︎",
    },
    {
      step: "3",
      title: "Choose Add to Home Screen",
      body: "Scroll the share sheet a little if needed, then tap Add to Home Screen.",
      icon: "➕",
    },
    {
      step: "4",
      title: "Tap Add",
      body: "Keep the Lunch Loop name, then tap Add in the upper-right corner.",
      icon: "🍽️",
    },
  ],
  android: [
    {
      step: "1",
      title: "Open Lunch Loop in Chrome",
      body: "Use Chrome on your Android phone for the smoothest install.",
      icon: "🌐",
    },
    {
      step: "2",
      title: "Open Chrome’s menu",
      body: "Tap the three dots in the top-right corner of Chrome.",
      icon: "⋮",
    },
    {
      step: "3",
      title: "Tap Install app",
      body: "Choose Install app or Add to Home screen—the wording can vary by Android version.",
      icon: "＋",
    },
    {
      step: "4",
      title: "Confirm Install",
      body: "Lunch Loop will appear with its orange icon and open like an app.",
      icon: "🍽️",
    },
  ],
};

function detectedPlatform(): Platform {
  if (typeof navigator === "undefined") return "iphone";
  return /android/i.test(navigator.userAgent) ? "android" : "iphone";
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("iphone");

  useEffect(() => {
    setPlatform(detectedPlatform());
  }, []);

  return (
    <AppFrame>
      <header className="mb-6">
        <p className="text-sm font-medium text-accent-strong">Install guide</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">
          Put Lunch Loop on your home screen
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-6 text-muted">
          About 30 seconds. Once installed, Lunch Loop opens in its own window
          with the orange icon, just like a regular app.
        </p>
      </header>

      <div
        className="inline-flex rounded-[var(--ll-radius-md)] bg-surface-muted p-1"
        role="tablist"
        aria-label="Choose your phone"
      >
        {[
          ["iphone", "iPhone & iPad"],
          ["android", "Android"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={platform === value}
            onClick={() => setPlatform(value as Platform)}
            className={cn(
              "rounded-[10px] px-4 py-2 text-sm font-medium transition",
              platform === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="mt-4 divide-y divide-line overflow-hidden rounded-[var(--ll-radius-lg)] bg-surface shadow-[var(--ll-shadow-card)]">
        {steps[platform].map((item) => (
          <li key={item.step} className="flex gap-4 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-ink">
              {item.step}
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{item.title}</h2>
              <p className="mt-0.5 text-sm leading-6 text-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-start gap-4 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)]">
        <BrandMark className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">The install option comes from your browser</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            On iPhone, use Safari, not an in-app browser from Messages, Gmail,
            or Discord. On Android, Chrome calls it “Install app” or “Add to
            Home screen.”
          </p>
          <Link href="/" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-strong">
            Open Lunch Loop →
          </Link>
        </div>
      </div>
    </AppFrame>
  );
}
