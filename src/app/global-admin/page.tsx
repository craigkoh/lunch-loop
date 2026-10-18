import { GlobalAdminScreen } from "@/components/global-admin-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function GlobalAdminPage() {
  await requirePageUser("/global-admin");
  return <GlobalAdminScreen />;
}
