"use client";

import Link from "next/link";
import { BrandMark } from "./brand-mark";
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

  const platformLabel = platform === "iphone" ? "iPhone & iPad" : "Android";
  const menuSymbol = platform === "iphone" ? "⤴︎" : "⋮";

  return (
    <main className="min-h-dvh bg-[#fffaf3] text-stone-900">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-black tracking-tight text-orange-950"
        >
          <BrandMark className="size-10" />
          <span>Lunch Loop</span>
        </Link>
        <Link
          href="/"
          className="rounded-xl px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-orange-100"
        >
          Back to Lunch Loop
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pb-24 sm:pt-12">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
            Install guide
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-6xl">
            Put Lunch Loop on your home screen.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            It takes about 30 seconds. Once installed, Lunch Loop opens in its
            own window with the orange icon—just like a regular phone app.
          </p>
        </div>

        <div
          className="mt-8 inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-orange-100"
          role="tablist"
          aria-label="Choose your phone"
        >
          {[
            ["iphone", "🍎 iPhone & iPad"],
            ["android", "🤖 Android"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={platform === value}
              onClick={() => setPlatform(value as Platform)}
              className={[
                "rounded-xl px-4 py-2.5 text-sm font-black transition",
                platform === value
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-stone-600 hover:bg-orange-50",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div className="mx-auto w-full max-w-[20rem] rounded-[2.75rem] border-[10px] border-stone-900 bg-stone-900 p-2 shadow-2xl shadow-orange-200">
            <div className="relative min-h-[31rem] overflow-hidden rounded-[2.1rem] bg-[#fffaf3] px-4 pb-5 pt-9">
              <div className="absolute inset-x-0 top-0 mx-auto h-6 w-28 rounded-b-2xl bg-stone-900" />
              <div className="flex items-center justify-between text-[10px] font-black text-stone-500">
                <span>9:41</span>
                <span>{platform === "iphone" ? "▮▮▮ ᯤ" : "◒ ◔ ▰"}</span>
              </div>
              <div className="mt-5 rounded-2xl bg-orange-500 p-4 text-white shadow-lg shadow-orange-200">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-100">
                  lunchloop.app
                </p>
                <p className="mt-2 text-xl font-black leading-tight">
                  The fun lunch loop for friends.
                </p>
              </div>
              <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-orange-500 text-2xl">
                    🍽️
                  </span>
                  <div>
                    <p className="text-sm font-black">Lunch Loop</p>
                    <p className="text-xs text-stone-500">One tap away</p>
                  </div>
                </div>
              </div>
              <div className="install-pointer absolute bottom-12 right-6 grid size-14 place-items-center rounded-2xl bg-white text-3xl shadow-xl ring-1 ring-orange-100">
                {menuSymbol}
              </div>
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-full bg-stone-900 px-5 py-3 text-xs font-black text-white">
                <span>Follow step {steps[platform][0].step}–4</span>
                <span aria-hidden="true">→</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              {platformLabel}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              Follow these four taps
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {steps[platform].map((item) => (
                <article
                  key={item.step}
                  className="relative min-h-44 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100"
                >
                  <span className="absolute right-4 top-4 text-xs font-black text-orange-400">
                    {item.step}/4
                  </span>
                  <span className="grid size-11 place-items-center rounded-2xl bg-orange-100 text-2xl text-orange-900">
                    {item.icon}
                  </span>
                  <h3 className="mt-4 pr-8 text-base font-black">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-orange-500 p-6 text-white sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-100">
                A small heads-up
              </p>
              <h2 className="mt-2 text-2xl font-black">
                The install option comes from your browser.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-50">
                On iPhone, use Safari—not an in-app browser from Messages,
                Gmail, or Discord. On Android, Chrome usually calls the option
                “Install app” or “Add to Home screen.”
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-xl bg-white px-4 py-3 text-center text-sm font-black text-orange-800 shadow-sm"
            >
              Open Lunch Loop
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
