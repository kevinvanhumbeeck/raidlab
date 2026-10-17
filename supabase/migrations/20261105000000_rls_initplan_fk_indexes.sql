-- Performance lints from Supabase. Small tables today, so this is for later, not a fix.
--
-- auth.uid() in a policy runs once per row; (select auth.uid()) runs once per query. Same rules otherwise.
-- Foreign keys to characters get an index: the profile pages look up rows per character, and archiving or deleting a
-- character deletes its rows. The other unindexed foreign keys point at classes, specs, instances and the raid's
-- creator, which nobody looks up that way or deletes.
--
-- Undo:
-- drop index public.characters_owner_idx, public.signups_character_idx, public.comp_slots_character_idx,
--   public.attendance_character_idx, public.raid_duties_character_idx, public.split_rosters_character_idx;
-- and the policies with auth.uid() instead of (select auth.uid()), as in 20261013000000, 20261014000000,
-- 20261101000000 and 20261102000000.

alter policy "update own" on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy "read" on public.profiles
  using (id = (select auth.uid()) or public.is_member());

alter policy "own signups" on public.signups
  using (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  );

alter policy "own reserves" on public.reserves
  using (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  );

alter policy "own characters insert" on public.characters
  with check ((owner_id = (select auth.uid()) and public.is_member()) or public.is_officer());

alter policy "own characters update" on public.characters
  using ((owner_id = (select auth.uid()) and public.is_member()) or public.is_officer())
  with check ((owner_id = (select auth.uid()) and public.is_member()) or public.is_officer());

create index characters_owner_idx on public.characters (owner_id);
create index signups_character_idx on public.signups (character_id);
create index comp_slots_character_idx on public.comp_slots (character_id);
create index attendance_character_idx on public.attendance (character_id);
create index raid_duties_character_idx on public.raid_duties (character_id);
create index split_rosters_character_idx on public.split_rosters (character_id);
