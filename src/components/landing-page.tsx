import Link from "next/link";

const loopSteps = [
  {
    emoji: "🎯",
    title: "Pick a rhythm",
    body: "Use a Standing loop for a recurring crew, or an Occasion for a special night out.",
  },
  {
    emoji: "🙅",
    title: "Use one veto",
    body: "Everyone else gets one thoughtful veto. The last place standing wins.",
  },
  {
    emoji: "📚",
    title: "Build a shared memory",
    body: "Keep the places, visits, favorites, and “never again” calls in one spot.",
  },
];

export function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#fffaf3] text-stone-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-black tracking-tight text-orange-950"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-orange-500 text-xl shadow-sm">
            🍽️
          </span>
          <span>Lunch Loop</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-black text-white shadow-sm transition hover:bg-orange-600"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-7 sm:px-6 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-orange-800">
            <span aria-hidden="true">🍽️</span> Private crews, simple starts
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.055em] text-orange-950 sm:text-6xl lg:text-7xl">
            The fun lunch loop for 2–6 friends.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-700 sm:text-xl">
            Lunch Loop is the fun, data-driven way for 2–6 friends to decide
            meals together—whether you meet every week or only for special nights out.
          </p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-500">
            Standing loops rotate the picker; Occasion loops let whoever starts
            the night make the picks. Both use vetoes and a shared list—no more
            “you pick.” Create a private crew for your own friends, or use an
            owner&apos;s invitation to join one.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/start"
              className="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-orange-600"
            >
              Create your Lunch Loop <span className="ml-2 text-lg">→</span>
            </Link>
          </div>
          <p className="mt-4 text-xs font-semibold text-stone-500">
            Already have a crew&apos;s invitation code?{" "}
            <Link href="/sign-in" className="text-orange-700 underline">
              Sign in to join it.
            </Link>
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="absolute -right-8 -top-10 size-40 rounded-full bg-amber-200/60 blur-3xl" />
          <div className="relative rounded-[2.25rem] bg-orange-500 p-3 shadow-2xl shadow-orange-200 sm:p-4">
            <div className="rounded-[1.7rem] bg-[#fffaf3] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">
                  A FUN EXAMPLE OF YOUR CREW&apos;S LOOP
                </span>
                <span className="text-2xl" aria-hidden="true">
                  🎲
                </span>
              </div>
              <h2 className="mt-5 text-3xl font-black tracking-tight">
                Where are we going today?
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                For a three-person crew: three picks, two friendly vetoes, one easy answer.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  "🥪  A fresh pick from the list",
                  "🍜  A crew favorite",
                  "🌮  The wild card",
                ].map((choice, index) => (
                  <div
                    key={choice}
                    className={[
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold",
                      index === 0
                        ? "bg-orange-500 text-white"
                        : "bg-white shadow-sm ring-1 ring-stone-100",
                    ].join(" ")}
                  >
                    <span>{choice}</span>
                    <span aria-hidden="true">{index === 0 ? "✓" : "…"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-emerald-950">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                  The simple rule
                </p>
                <p className="mt-1 text-sm font-bold">
                  Make deciding lunch easy and fun!
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-orange-100 bg-white/80">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.18em] text-orange-600">
            A tiny ritual with a better memory
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {loopSteps.map((step) => (
              <article
                key={step.title}
                className="rounded-3xl bg-[#fffaf3] p-5 shadow-sm ring-1 ring-orange-100"
              >
                <div className="text-3xl" aria-hidden="true">
                  {step.emoji}
                </div>
                <h2 className="mt-4 text-xl font-black">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-7 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
            Built for your phone
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Put Lunch Loop one tap away.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
            Add Lunch Loop to your iPhone or Android home screen. It opens like
            an app, keeps the orange Lunch Loop icon, and stays in your normal
            phone routine.
          </p>
          <Link
            href="/install"
            className="mt-5 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600"
          >
            See the 30-second install guide →
          </Link>
        </div>
        <div className="install-pulse relative mx-auto grid size-36 place-items-center rounded-[2.5rem] bg-orange-500 text-6xl shadow-xl shadow-orange-200">
          🍽️
          <span className="absolute -bottom-3 -right-3 grid size-12 place-items-center rounded-2xl bg-white text-2xl shadow-lg">
            ⤴︎
          </span>
        </div>
      </section>

      <footer className="border-t border-orange-100 px-4 py-8 text-center text-xs leading-5 text-stone-500">
        <p>© Craig Kohler · Lunch Loop · Private crews for real-life friends</p>
        <p className="mt-1">
          <a
            href="https://craigkohler.com"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-orange-700 underline"
          >
            craigkohler.com
          </a>
        </p>
        <p className="mt-2 flex justify-center gap-3">
          <Link href="/whats-new" className="font-bold text-orange-700 underline">
            What&apos;s New
          </Link>
          <Link href="/privacy" className="font-bold text-orange-700 underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="font-bold text-orange-700 underline">
            Terms of Use
          </Link>
        </p>
      </footer>
    </main>
  );
}
