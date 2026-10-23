import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinInviteScreen } from "@/components/join-invite-screen";

const inviteTitle = "Join a Lunch Loop";
const inviteDescription =
  "A friend invited you to a private lunch crew. Sign in once and you’re in — turns, vetoes, and a shared restaurant list.";

export const metadata: Metadata = {
  title: inviteTitle,
  description: inviteDescription,
  openGraph: {
    title: inviteTitle,
    description: inviteDescription,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Lunch Loop — the fun lunch loop for 2–6 friends" }],
  },
  twitter: {
    card: "summary_large_image",
    title: inviteTitle,
    description: inviteDescription,
    images: ["/twitter-image"],
  },
};

export default function JoinPage() {
  return <Suspense fallback={null}><JoinInviteScreen /></Suspense>;
}
