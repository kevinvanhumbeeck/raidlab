-- Discord bot (#49): the raid's announcement message, so the bot can update it when sign-ups change.
--
-- Undo: alter table public.raids drop column discord_message_id;

alter table public.raids add column discord_message_id text;
