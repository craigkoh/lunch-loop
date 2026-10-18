import { DatabaseScreen, type Sort } from "@/components/database-screen";
import { requirePageUser } from "@/lib/supabase/server";

const validSorts = new Set<Sort>(["newest", "oldest", "most-picked", "least-picked", "recently-visited", "never-visited"]);

export default async function DatabasePage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requirePageUser("/database");
  const { sort } = await searchParams;
  return <DatabaseScreen initialSort={sort && validSorts.has(sort as Sort) ? sort as Sort : "newest"} />;
}
