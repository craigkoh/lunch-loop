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
  },
  twitter: {
    card: "summary_large_image",
    title: startTitle,
    description: startDescription,
  },
};

export default function StartPage() {
  return <Suspense fallback={null}><StartLoopScreen /></Suspense>;
}
