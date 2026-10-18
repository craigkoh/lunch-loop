import { AccountScreen } from "@/components/account-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function AccountPage() {
  await requirePageUser("/account");
  return <AccountScreen />;
}
