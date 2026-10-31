import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { FuelTheLoopLink } from "./quiet-donation-link";

/*
 * The logged-out home (build .75). Three type sizes only:
 *   display  44px phone / 72px desktop  (the hero line)
 *   title    30px phone / 44px desktop  (section headings)
 *   body     17px phone / 19px desktop  (everything else, footer included)
 * App pictures are real screenshots in /public/landing, framed as devices.
 */
const display = "text-[44px] font-bold leading-[1.04] tracking-[-0.04em] md:text-[72px]";
const title = "text-[30px] font-bold leading-[1.12] tracking-[-0.03em] md:text-[44px]";
const body = "text-[17px] leading-[1.55] md:text-[19px]";
const primaryButton =
  "inline-flex min-h-13 items-center justify-center rounded-[var(--ll-radius-md)] bg-accent-strong px-7 font-semibold text-on-accent shadow-[0_8px_24px_rgb(194_65_12_/_0.25)] transition hover:brightness-110";

const steps = [
  { name: "Picks", text: "It’s someone’s turn. They choose one place per person from your crew’s list." },
  { name: "Vetoes", text: "Everyone else gets exactly one veto. Fair, fast, a little dramatic." },
  { name: "Winner", text: "The last place standing wins. Eat, close the loop, and the next person picks." },
];

const perks = [
  "History by month, with who picked and who vetoed",
  "Friendly stats and little celebrations for your 10th, 25th and 50th lunch",
  "Invite-only crews of 2–6. No feed, no ads",
  "Weekly loops or one-off occasions",
];

function Phone({ src, alt, className = "relative" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-[44px] bg-[#111] p-[10px] shadow-[0_40px_80px_rgb(0_0_0_/_0.22)] ${className}`}>
      <span aria-hidden="true" className="absolute left-1/2 top-[20px] z-10 h-[24px] w-[82px] -translate-x-1/2 rounded-full bg-[#111]" />
      <img src={src} alt={alt} width={780} height={1688} className="block w-full rounded-[34px]" />
    </div>
  );
}

export function LandingPage() {
  return (
    <main className={`min-h-dvh overflow-x-clip bg-app text-ink ${body}`}>
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <nav className="flex h-[76px] items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <BrandMark className="size-9" />
            Lunch Loop
          </Link>
          <div className="flex items-center gap-7">
            <a href="#how" className="hidden text-muted hover:text-ink md:inline">How it works</a>
            <Link href="/sign-in" className="inline-flex min-h-11 items-center font-semibold text-accent-strong hover:underline">
              Sign in
            </Link>
          </div>
        </nav>

        <header className="relative pt-10 text-center md:pt-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-24 top-1/2 bg-[radial-gradient(55%_50%_at_50%_60%,rgb(249_115_22_/_0.16),transparent_70%)]" />
          <h1 className={`relative mx-auto max-w-4xl ${display}`}>
            Lunch, decided.
            <br />
            <span className="text-accent">
              No more <span className="whitespace-nowrap">“you pick.”</span>
            </span>
          </h1>
          <p className="relative mx-auto mt-6 max-w-2xl text-muted">
            One friend picks a few places. Everyone else gets one veto. The last place standing wins, and Lunch Loop
            remembers every lunch.
          </p>
          <div className="relative mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <Link href="/start" className={`${primaryButton} w-full sm:w-auto`}>
              Start your crew
            </Link>
            <Link href="/sign-in" className="inline-flex min-h-13 items-center px-4 font-semibold text-accent-strong hover:underline">
              Have an invite? Sign in →
            </Link>
          </div>

          {/* Phone: one framed phone, cropped so the page stays short. Desktop: laptop plus phone. */}
          <div className="relative mx-auto mt-12 h-[440px] max-w-[270px] overflow-hidden md:hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
            <Phone src="/landing/phone-win.webp" alt="Lunch Loop on a phone, showing today’s winner" />
          </div>
          <div className="relative mx-auto mt-20 hidden h-[600px] max-w-[1040px] md:block">
            <div className="absolute left-0 top-0 w-[860px]">
              <div className="rounded-t-[22px] bg-[#111] p-3.5 shadow-[0_40px_80px_rgb(0_0_0_/_0.18)]">
                <img src="/landing/desktop-win.webp" alt="Lunch Loop on a laptop, showing today’s winner" width={1600} height={1000} className="block w-full rounded-lg" />
              </div>
              <div className="-mx-12 h-5 rounded-b-[18px] bg-gradient-to-b from-[#e7e7ea] to-[#c9c9ce]" />
            </div>
            <Phone src="/landing/phone-win.webp" alt="" className="absolute right-0 top-20 w-[270px]" />
          </div>
        </header>

        <section id="how" className="scroll-mt-8 pt-20 md:pt-32">
          <h2 className={`text-center ${title}`}>Three steps. No <span className="whitespace-nowrap">group-chat</span> chaos.</h2>
          <ol className="relative mx-auto mt-10 grid max-w-md gap-8 md:mt-16 md:max-w-none md:grid-cols-3 md:gap-10">
            <span aria-hidden="true" className="absolute bottom-7 left-[26px] top-7 w-1 rounded-full bg-gradient-to-b from-accent via-accent to-accent-soft md:inset-x-[16.6%] md:bottom-auto md:top-[26px] md:h-1 md:w-auto md:bg-gradient-to-r" />
            {steps.map((step, index) => (
              <li key={step.name} className="relative grid grid-cols-[56px_1fr] gap-4 md:block md:text-center">
                <span className={`relative z-10 grid size-14 place-items-center rounded-full border-4 border-accent font-bold md:mx-auto ${index < 2 ? "bg-accent text-on-accent" : "bg-surface text-accent-strong"}`}>
                  {index + 1}
                </span>
                <div className="pt-3 md:pt-6">
                  <h3 className="font-semibold">{step.name}</h3>
                  <p className="mt-1 text-muted md:mx-auto md:max-w-xs">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid items-center gap-12 pt-20 md:grid-cols-2 md:gap-20 md:pt-32">
          <div className="relative hidden h-[560px] overflow-hidden rounded-[40px] bg-gradient-to-br from-accent-soft to-surface md:block">
            <Phone src="/landing/phone-history.webp" alt="Lunch Loop history, grouped by month" className="absolute left-1/2 top-14 w-[250px] -translate-x-1/2 rotate-[-3deg]" />
          </div>
          <div>
            <h2 className={title}>Every lunch, remembered.</h2>
            <p className="mt-4 text-muted">
              The places you love, the ones you haven’t tried, and the “never again” calls, in one calm list the whole
              crew shares.
            </p>
            <ul className="mt-6 space-y-3">
              {perks.map((perk) => (
                <li key={perk} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-strong">✓</span>
                  {perk}
                </li>
              ))}
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent-strong">✓</span>
                <span>
                  Feels like an app.{" "}
                  <Link href="/install" className="font-semibold text-accent-strong hover:underline">Add it to your home screen →</Link>
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="relative mt-20 overflow-hidden rounded-[32px] bg-[#1c1c1e] px-6 py-14 text-center text-white md:mt-32 md:rounded-[40px] md:py-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_50%_120%,rgb(249_115_22_/_0.45),transparent_70%)]" />
          <BrandMark className="relative mx-auto size-16" />
          <h2 className={`relative mt-6 ${title}`}>Where are we going today?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[#c7c7cc]">Start a crew in a minute, or join one with an invite from a friend.</p>
          <Link href="/start" className={`relative mt-8 w-full sm:w-auto ${primaryButton}`}>
            Start your crew
          </Link>
        </section>

        <footer className="py-12 text-center text-muted">
          <p className="font-medium text-ink">
            Built by{" "}
            <a href="https://craigkohler.com" target="_blank" rel="noreferrer" className="text-accent-strong hover:underline">
              Craig Kohler
            </a>{" "}
            with AI
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6">
            <Link href="/whats-new" className="inline-flex min-h-11 items-center hover:text-ink">What’s New</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-ink">Privacy</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-ink">Terms</Link>
            <FuelTheLoopLink className="" />
          </div>
        </footer>
      </div>
    </main>
  );
}
