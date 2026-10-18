import { Suspense } from "react";
import { StartLoopScreen } from "@/components/start-loop-screen";

export default function StartPage() {
  return <Suspense fallback={null}><StartLoopScreen /></Suspense>;
}
