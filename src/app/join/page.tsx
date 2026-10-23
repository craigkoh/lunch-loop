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
  },
  twitter: {
    card: "summary_large_image",
    title: inviteTitle,
    description: inviteDescription,
  },
};

export default function JoinPage() {
  return <Suspense fallback={null}><JoinInviteScreen /></Suspense>;
}
