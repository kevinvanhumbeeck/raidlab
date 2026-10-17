-- RLS role checks once per query instead of once per row (#110).
--
-- is_member(), is_officer() and is_admin() are security definer, so Postgres can't inline them and calls them for
-- every row, also for rows embedded through PostgREST: the attendance list with its raids and characters ran
-- is_member() 600 times for 200 rows. They take nothing from the row, so (select public.is_member()) runs once per
-- query and answers the same. Who can do what doesn't change. can_edit_raid(raid_id) and friends depend on the row
-- and stay as they are.
--
-- Undo: the policies as in 20261014000000, 20261015000000, 20261020000000, 20261023000000, 20261029000000,
-- 20261101000000, 20261103000000 and 20261105000000.

-- Reads: members, and everyone their own profile.
alter policy "read" on public.profiles using (id = (select auth.uid()) or (select public.is_member()));
alter policy "read" on public.classes using ((select public.is_member()));
alter policy "read" on public.specs using ((select public.is_member()));
alter policy "read" on public.characters using ((select public.is_member()));
alter policy "read" on public.raids using ((select public.is_member()));
alter policy "read" on public.signups using ((select public.is_member()));
alter policy "read" on public.comp_slots using ((select public.is_member()));
alter policy "read" on public.raid_duties using ((select public.is_member()));
alter policy "read" on public.attendance using ((select public.is_member()));
alter policy "read" on public.instances using ((select public.is_member()));
alter policy "read" on public.loot_items using ((select public.is_member()));
alter policy "read" on public.reserves using ((select public.is_member()));
alter policy "read" on public.hard_reserves using ((select public.is_member()));
alter policy "read" on public.split_rosters using ((select public.is_member()));
alter policy "admins read" on public.history using ((select public.is_admin()));

-- Characters.
alter policy "own characters insert" on public.characters
  with check ((owner_id = (select auth.uid()) and (select public.is_member())) or (select public.is_officer()));
alter policy "own characters update" on public.characters
  using ((owner_id = (select auth.uid()) and (select public.is_member())) or (select public.is_officer()))
  with check ((owner_id = (select auth.uid()) and (select public.is_member())) or (select public.is_officer()));
alter policy "admins delete" on public.characters using ((select public.is_admin()));

-- Sign-ups and soft reserves.
alter policy "own signups" on public.signups
  using (
    public.can_edit_raid(raid_id)
    or (
      (select public.is_member())
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      (select public.is_member())
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  );

alter policy "own reserves" on public.reserves
  using (
    public.can_edit_raid(raid_id)
    or (
      (select public.is_member())
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      (select public.is_member())
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    )
  );

-- Raids, instances, loot tables and split rosters.
alter policy "officers delete" on public.raids
  using ((select public.is_admin()) or ((select public.is_officer()) and starts_at > now()));
alter policy "admins" on public.instances using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admins" on public.loot_items using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "officers" on public.split_rosters
  using ((select public.is_officer())) with check ((select public.is_officer()));
