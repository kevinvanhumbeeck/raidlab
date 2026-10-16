-- Officers ping the members who haven't responded to a raid in the Discord raid channel (#58). pinged_at is the
-- last ping, for the cooldown between pings.
--
-- Undo: alter table public.raids drop column pinged_at;

alter table public.raids add column pinged_at timestamptz;
