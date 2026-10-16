-- Archiving characters (#89): deleting a character used to remove its sign-ups, comp slots, reserves and attendance
-- with it, so anyone could wipe their own raid history. Players now archive characters instead: archived characters
-- leave the pickers and rosters but stay in past raids, attendance and profiles, and can be restored. Only admins
-- delete characters for good (e.g. a typo, or the sample data before launch).
--
-- Archiving takes the character out of raids that haven't started, and hands "main" to the player's oldest active
-- character. Names only have to be unique among active characters, so a restore can clash with a newer character.
--
-- Undo:
-- drop trigger archive_character on public.characters; drop trigger archived_not_main on public.characters;
-- drop function public.archive_character(); drop function public.archived_not_main();
-- drop policy "own characters insert" on public.characters; drop policy "own characters update" on public.characters;
-- drop policy "admins delete" on public.characters;
-- create policy "own characters" on public.characters for all to authenticated
--   using ((owner_id = auth.uid() and public.is_member()) or public.is_officer())
--   with check ((owner_id = auth.uid() and public.is_member()) or public.is_officer());
-- drop index public.characters_name_key; create unique index characters_name_key on public.characters (lower(name));
-- alter table public.characters drop column archived_at;

alter table public.characters add column archived_at timestamptz;

drop index public.characters_name_key;
create unique index characters_name_key on public.characters (lower(name)) where archived_at is null;

-- An archived character is never the main.
create function public.archived_not_main()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_main := false;
  return new;
end;
$$;

create trigger archived_not_main before update of archived_at on public.characters
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function public.archived_not_main();

-- Security definer: players can't remove their own sign-ups once a raid is locked, but archiving still takes the
-- character out of it, as long as it hasn't started. Reserves go with the sign-up.
create function public.archive_character()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.comp_slots s using public.raids r
    where s.raid_id = r.id and s.character_id = new.id and r.starts_at > now();
  delete from public.raid_duties d using public.raids r
    where d.raid_id = r.id and d.character_id = new.id and r.starts_at > now();
  delete from public.signups s using public.raids r
    where s.raid_id = r.id and s.character_id = new.id and r.starts_at > now();
  delete from public.split_rosters where character_id = new.id;

  if not exists (
    select 1 from public.characters where owner_id = new.owner_id and archived_at is null and is_main
  ) then
    update public.characters set is_main = true
    where id = (
      select id from public.characters
      where owner_id = new.owner_id and archived_at is null
      order by created_at
      limit 1
    );
  end if;
  return null;
end;
$$;

create trigger archive_character after update of archived_at on public.characters
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function public.archive_character();

-- Players add and change (archive, restore) their own characters, officers anyone's; only admins delete.
drop policy "own characters" on public.characters;
create policy "own characters insert" on public.characters for insert to authenticated
  with check ((owner_id = auth.uid() and public.is_member()) or public.is_officer());
create policy "own characters update" on public.characters for update to authenticated
  using ((owner_id = auth.uid() and public.is_member()) or public.is_officer())
  with check ((owner_id = auth.uid() and public.is_member()) or public.is_officer());
create policy "admins delete" on public.characters for delete to authenticated
  using (public.is_admin());
