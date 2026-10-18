import { Suspense } from "react";
import { JoinInviteScreen } from "@/components/join-invite-screen";

export default function JoinPage() {
  return <Suspense fallback={null}><JoinInviteScreen /></Suspense>;
}
