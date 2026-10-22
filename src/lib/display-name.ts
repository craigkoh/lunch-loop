type NamedUser = {
  email?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null } | null;
} | null | undefined;

/** Google name when present, otherwise the mailbox name before @. */
export function suggestedDisplayName(user: NamedUser) {
  const full = user?.user_metadata?.full_name?.trim() ?? "";
  const name = user?.user_metadata?.name?.trim() ?? "";
  const local = user?.email?.split("@")[0]?.trim() ?? "";
  return (full || name || local).slice(0, 50);
}
