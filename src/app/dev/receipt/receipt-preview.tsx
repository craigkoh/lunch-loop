"use client";

import { PickNudgeView } from "@/components/pick-value-nudge";
import type { NudgeStyle, PickNudgeFacts } from "@/lib/donation";

const regularLunch: PickNudgeFacts = {
  loopName: "Downtown Lunch Crew",
  restaurantName: "Los Bravos Mexican Restaurant",
  pickedOn: "Oct 27",
  placesInRunning: 4,
  vetoCount: 3,
  decideMinutes: 23,
  distanceMiles: 2.4,
  visitNumber: 5,
  daysSinceLastVisit: 18,
  rating: 4.4,
  cuisine: "Mexican",
  pickedBy: "Seth",
};

const firstLunch: PickNudgeFacts = {
  loopName: "Brand New Loop",
  restaurantName: "Penny Lane Coffeehouse",
  pickedOn: "Oct 27",
  placesInRunning: 2,
  vetoCount: 1,
  decideMinutes: 4,
  distanceMiles: 0.8,
  visitNumber: 1,
  daysSinceLastVisit: null,
  rating: 4.7,
  cuisine: "Cafe",
  pickedBy: "Craig",
};

function Hero({ style, facts, label }: { style: NudgeStyle; facts: PickNudgeFacts; label: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-orange-500 p-4 text-white shadow-lg shadow-orange-200 sm:p-6">
      <div className="pick-layout relative">
        <div className="pick-main min-w-0">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-100">{label}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">{facts.restaurantName} wins!</h1>
          <p className="mt-3 text-orange-50">Fixture data. This page only exists in local development.</p>
        </div>
        <div className="pick-nudge min-w-0">
          <PickNudgeView style={style} variant={2} facts={facts} onDismiss={() => undefined} />
        </div>
        <div className="pick-actions min-w-0" />
      </div>
    </section>
  );
}

export function ReceiptPreview() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-[#fffaf3] p-4 md:p-6">
      <Hero style="receipt" facts={regularLunch} label="Receipt · regular lunch" />
      <Hero style="receipt" facts={firstLunch} label="Receipt · first lunch" />
      <Hero style="jar" facts={regularLunch} label="Tip jar" />
      <Hero style="line" facts={regularLunch} label="One-liner" />
    </main>
  );
}
