import { SettingsScreen } from "@/components/settings-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function Settings() {
  await requirePageUser("/settings");
  return <SettingsScreen />;
}
