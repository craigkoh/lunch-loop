-- Retire the pre-invitation onboarding endpoints. The current app uses only
-- recipient-bound invitations and the newer loop-creation RPC. Leaving these
-- old functions executable would let a signed-in caller bypass invite-only
-- access, the two-owned-loop cap, six-member cap, and required home-area setup.

revoke all on function public.create_lunch_group(text, text) from public, anon, authenticated;
revoke all on function public.join_lunch_group(text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
