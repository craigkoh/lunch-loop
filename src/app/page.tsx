import { connection } from "next/server";
import { HomeScreen } from "@/components/home-screen";
import { LandingPage } from "@/components/landing-page";
import { getOptionalUser } from "@/lib/supabase/server";

export default async function Home() {
  await connection();
  const user = await getOptionalUser();
  return user ? <HomeScreen /> : <LandingPage />;
}
