import type { Metadata } from "next";
import { Suspense } from "react";
import { StartLoopScreen } from "@/components/start-loop-screen";

const startTitle = "Build a Lunch Loop";
const startDescription =
  "Start a private lunch crew for 2–6 friends. Pick a name, invite the group, and let the loop decide.";

export const metadata: Metadata = {
  title: startTitle,
  description: startDescription,
  openGraph: {
    title: startTitle,
    description: startDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Lunch Loop — the fun lunch loop for 2–6 friends" }],
  },
  twitter: {
    card: "summary_large_image",
    title: startTitle,
    description: startDescription,
    images: ["/twitter-image"],
  },
};

export default function StartPage() {
  return <Suspense fallback={null}><StartLoopScreen /></Suspense>;
}
