-- Sign-up reminders (#59): the Discord bot DMs members who haven't responded, once, a while before the raid.
-- reminded_at marks a raid as done, so the reminder goes out once. discord_dms lets players turn the DMs off.
--
-- Undo: alter table public.raids drop column reminded_at; alter table public.profiles drop column discord_dms;

alter table public.raids add column reminded_at timestamptz;

alter table public.profiles add column discord_dms boolean not null default true;
grant update (discord_dms) on public.profiles to authenticated;
