-- Undo 20261021000000: with reserves referencing both signups and characters, the API sees two
-- relationships between signups and characters and refuses to embed characters in sign-up queries.
-- Reserves reach their character through the sign-up instead.
alter table public.reserves drop constraint reserves_character_id_fkey;
