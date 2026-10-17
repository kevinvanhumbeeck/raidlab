-- Supabase's linter flags security definer functions that anon or authenticated can call through /rest/v1/rpc.
-- Nothing was exploitable: trigger functions can't be called directly, and the role checks only answer for the caller.
-- This takes away what nobody needs, so the warnings that stay are the intended ones.
--
-- Trigger functions run as triggers only; the execute privilege is checked when a trigger is created, not when it
-- fires. The role checks stay callable for signed-in players, since every RLS policy calls them as the player; all
-- policies are for authenticated, so anon never needs them. set_officer, set_member and set_admin stay as they are:
-- the manage page calls them and they check the caller themselves.
--
-- Undo:
-- grant execute on function public.record_history(), public.handle_new_user(), public.archive_character()
--   to public, anon, authenticated;
-- grant execute on function public.is_admin(), public.is_member(), public.is_officer() to public, anon;

revoke execute on function public.record_history(), public.handle_new_user(), public.archive_character()
  from public, anon, authenticated;
revoke execute on function public.is_admin(), public.is_member(), public.is_officer()
  from public, anon;
