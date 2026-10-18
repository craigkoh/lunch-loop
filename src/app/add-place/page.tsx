import { AddPlaceScreen } from "@/components/add-place-screen";
import { requirePageUser } from "@/lib/supabase/server";

export default async function AddPlace() {
  await requirePageUser("/add-place");
  return <AddPlaceScreen />;
}
