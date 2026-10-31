import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { ListCard, SectionTitle } from "@/components/ui/card";
import { appInfo } from "@/lib/app-info";

const description = "Lunch Loop is Craig Kohler’s idea, brought to life with new tools. A little about Craig and why he made it.";

export const metadata: Metadata = {
  title: "About | Lunch Loop",
  description,
  openGraph: {
    title: "About | Lunch Loop",
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Lunch Loop — the fun lunch loop for 2–6 friends" }],
  },
  twitter: { card: "summary_large_image", title: "About | Lunch Loop", description, images: ["/twitter-image"] },
};

const videoUrl = "https://www.youtube.com/watch?v=rYxzBJ-wdog";

const links = [
  { label: "craigkohler.com", href: "https://craigkohler.com" },
  { label: "YouTube", detail: "@craigkoh", href: "https://www.youtube.com/@craigkoh" },
  { label: "LinkedIn", detail: "craigkohler", href: "https://www.linkedin.com/in/craigkohler/" },
  { label: "X", detail: "@craigkoh", href: "https://x.com/craigkoh" },
  { label: "Facebook", detail: "craigkoh", href: "https://www.facebook.com/craigkoh" },
];

/**
 * Public About page (build .76). The footer credit links here. The old TV
 * clip is a local thumbnail that links out to YouTube: no embed, no
 * third-party request until someone taps it.
 */
export default function AboutPage() {
  const buildNumber = appInfo.build.split(".").pop();
  return (
    <AppFrame>
      <article className="mx-auto max-w-2xl">
        <header>
          <p className="text-sm font-medium text-accent-strong">About</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight md:text-[36px]">Hi, I’m Craig.</h1>
          <p className="mt-3 text-[17px] leading-7 text-muted">
            I’ve always been the friend who tries the new thing first.
          </p>
        </header>

        <section className="mt-6 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)] md:p-6">
          <h2 className="text-[19px] font-semibold tracking-tight">Why Lunch Loop</h2>
          <div className="mt-2 space-y-3 text-[15px] leading-7 text-muted">
            <p>
              Deciding where to eat lunch with friends always went the same way: “you pick,” then a round of vetoes in the group chat. I started Lunch Loop in August 2026 to fix that. One friend picks a few places, everyone else gets one veto, and the last place standing wins.
            </p>
            <p>
              Lunch Loop is my idea, inspiration and creative direction, brought to life with new tools. Codex even named it. It’s on build {buildNumber} and still growing.
            </p>
            <p>
              It’s free, with no ads and no paid placement, and each crew’s places and picks stay private to that crew.
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-[var(--ll-radius-lg)] bg-surface p-5 shadow-[var(--ll-shadow-card)] md:p-6">
          <h2 className="text-[19px] font-semibold tracking-tight">A lifelong early adopter</h2>
          <div className="mt-2 space-y-3 text-[15px] leading-7 text-muted">
            <p>
              I got into home automation back in the X10 days, had one of the first cable modems in town, and used a wireless Palm OS device to control my house when I was away.
            </p>
            <p>
              About 23 years ago, a friend who produced the local weekend news parked a live TV truck at my house. Someone in Henderson controlled the lights in my Evansville house, live on TV.
            </p>
          </div>
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="group mt-4 block overflow-hidden rounded-[var(--ll-radius-md)] bg-surface-muted"
          >
            <span className="relative block aspect-[4/3] w-full sm:aspect-video">
              <Image
                src="/about/live-tv-house.webp"
                alt="Craig on the local news, live from his house"
                fill
                sizes="(min-width: 768px) 640px, 100vw"
                className="object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white transition group-hover:bg-black/75">
                  <svg viewBox="0 0 24 24" className="ml-1 size-6" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
              </span>
            </span>
            <span className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
              <span className="font-semibold text-ink">“House of the future” on YouTube</span>
              <span className="text-subtle" aria-hidden="true">↗</span>
            </span>
          </a>
        </section>

        <SectionTitle className="mt-8" title="Say hi" />
        <ListCard className="mt-3">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center gap-3 px-5 py-3 text-[15px] hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 font-semibold text-ink">{link.label}</span>
                {link.detail ? <span className="text-muted">{link.detail}</span> : null}
                <span className="text-subtle" aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ListCard>

        <p className="mt-8 text-center text-[15px]">
          <Link href="/" className="font-medium text-accent-strong">Back to Lunch Loop →</Link>
        </p>
      </article>
    </AppFrame>
  );
}
