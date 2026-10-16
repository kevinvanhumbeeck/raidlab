-- Audit log (#90): every change to raids, sign-ups, comps, duties, reserves, attendance, characters and roles,
-- with who made it and the row before and after. Only admins read it; nobody can change it.
--
-- actor is the logged-in player. Server code using the secret key (the Discord bot) has no logged-in player; it
-- names the player it acts for in the x-raidlab-actor header, and otherwise the change is recorded as the system's
-- (actor null). The header only counts without a logged-in player, and those requests can't write anything else
-- than through the secret key, since every write policy is for authenticated players.
--
-- Bookkeeping columns the bot updates (Discord message, pings, reminders) are ignored, so they don't fill the log.
--
-- Undo:
-- drop trigger history on public.raids; drop trigger history on public.signups;
-- drop trigger history on public.comp_slots; drop trigger history on public.raid_duties;
-- drop trigger history on public.reserves; drop trigger history on public.hard_reserves;
-- drop trigger history on public.attendance; drop trigger history on public.characters;
-- drop trigger history on public.profiles;
-- drop function public.record_history(); drop table public.history;

create table public.history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- The raid the row belongs to, for a raid's own history. No foreign key: history outlives deleted raids.
  raid_id uuid,
  old jsonb,
  new jsonb
);
create index history_at_idx on public.history (at desc);
create index history_raid_idx on public.history (raid_id, at desc);

alter table public.history enable row level security;
create policy "admins read" on public.history for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.history from anon, authenticated;

-- Trigger arguments: columns to ignore. An update that only changes those isn't recorded.
create function public.record_history()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  ignored text[] := coalesce(tg_argv::text[], '{}');
  actor uuid := auth.uid();
  raid uuid;
begin
  if tg_op = 'UPDATE' and (old_row - ignored) = (new_row - ignored) then
    return null;
  end if;

  if actor is null then
    actor := nullif(current_setting('request.headers', true)::jsonb ->> 'x-raidlab-actor', '')::uuid;
  end if;

  raid := case tg_table_name
    when 'raids' then (coalesce(new_row, old_row) ->> 'id')::uuid
    else (coalesce(new_row, old_row) ->> 'raid_id')::uuid
  end;

  insert into public.history (actor, table_name, action, raid_id, old, new)
  values (actor, tg_table_name, lower(tg_op), raid, old_row, new_row);
  return null;
end;
$$;

create trigger history after insert or update or delete on public.raids
  for each row execute function public.record_history('pinged_at', 'reminded_at', 'discord_message_id');
create trigger history after insert or update or delete on public.signups
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.comp_slots
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.raid_duties
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.reserves
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.hard_reserves
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.attendance
  for each row execute function public.record_history();
create trigger history after insert or update or delete on public.characters
  for each row execute function public.record_history();
-- Profiles: only access and roles. Logins refresh names and avatars, and those aren't worth keeping.
create trigger history after update of is_member, is_officer, is_admin on public.profiles
  for each row execute function public.record_history('display_name', 'avatar_url', 'discord_dms', 'slug');
