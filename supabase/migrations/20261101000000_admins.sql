-- Admins (#87) and the officer edit window (#88).
--
-- Admins are an app-only flag above officers, never synced from Discord, so handing out @officer in Discord can't
-- grant it. Admins can do everything officers can, plus: change raids at any time, delete raids that have started,
-- make and remove officers and admins, and edit instances and loot tables.
--
-- Officers change a raid's sign-ups, comp, duties, reserves and attendance until 3 days after it starts, so they
-- can handle no-shows and fix the comp and attendance afterwards. After that the raid is history: only admins can
-- change it. The 3 days is OFFICER_EDIT_DAYS in src/lib/wow.ts too.
--
-- Members can't change a raid once it has started, even when an officer unlocked it. Attendance can only be saved
-- once a raid has started.
--
-- Undo:
-- drop policy "admins" on public.instances; drop policy "admins" on public.loot_items;
-- create policy "officers" on public.instances for all to authenticated using (public.is_officer()) with check (public.is_officer());
-- create policy "officers" on public.loot_items for all to authenticated using (public.is_officer()) with check (public.is_officer());
-- drop policy "officers create" on public.raids; drop policy "officers update" on public.raids; drop policy "officers delete" on public.raids;
-- create policy "officers" on public.raids for all to authenticated using (public.is_officer()) with check (public.is_officer());
-- and the same for comp_slots, raid_duties, hard_reserves and attendance; "own signups" and "own reserves" as in
-- 20261018000000 and 20261020000000; raid_open as in 20261018000000; set_officer as in 20261014000000; then
-- drop function public.set_admin, public.can_edit_raid, public.can_edit_raid_at, public.raid_started;
-- is_officer as in 20261013000000, is_member as in 20261014000000, drop function public.is_admin;
-- alter table public.profiles drop column is_admin;

alter table public.profiles add column is_admin boolean not null default false;

-- The first admin: the oldest officer.
update public.profiles set is_admin = true
where id = (select id from public.profiles where is_officer order by created_at limit 1);

create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Admins can do everything officers can, also when Discord takes their @officer role away.
create or replace function public.is_officer()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_officer or is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_member or is_officer or is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Whether the current player may change a raid starting at starts_at as an officer: officers until 3 days after the
-- start, admins always.
create function public.can_edit_raid_at(starts_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin() or (public.is_officer() and now() < starts_at + interval '3 days');
$$;

create function public.can_edit_raid(raid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select public.can_edit_raid_at(starts_at) from public.raids where id = raid), false);
$$;

create function public.raid_started(raid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select starts_at <= now() from public.raids where id = raid), false);
$$;

-- Members: until the lock, and never after the start (unlocking a past raid doesn't reopen it).
create or replace function public.raid_open(raid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (locked_at is null or locked_at > now()) and starts_at > now() from public.raids where id = raid),
    false
  );
$$;

-- Raids: officers create and change them within the window, and delete them until they start.
drop policy "officers" on public.raids;
create policy "officers create" on public.raids for insert to authenticated
  with check (public.can_edit_raid_at(starts_at));
create policy "officers update" on public.raids for update to authenticated
  using (public.can_edit_raid_at(starts_at)) with check (public.can_edit_raid_at(starts_at));
create policy "officers delete" on public.raids for delete to authenticated
  using (public.is_admin() or (public.is_officer() and starts_at > now()));

drop policy "officers" on public.comp_slots;
create policy "officers" on public.comp_slots for all to authenticated
  using (public.can_edit_raid(raid_id)) with check (public.can_edit_raid(raid_id));

drop policy "officers" on public.raid_duties;
create policy "officers" on public.raid_duties for all to authenticated
  using (public.can_edit_raid(raid_id)) with check (public.can_edit_raid(raid_id));

drop policy "officers" on public.hard_reserves;
create policy "officers" on public.hard_reserves for all to authenticated
  using (public.can_edit_raid(raid_id)) with check (public.can_edit_raid(raid_id));

drop policy "officers" on public.attendance;
create policy "officers" on public.attendance for all to authenticated
  using (public.can_edit_raid(raid_id) and public.raid_started(raid_id))
  with check (public.can_edit_raid(raid_id) and public.raid_started(raid_id));

drop policy "own signups" on public.signups;
create policy "own signups" on public.signups for all to authenticated
  using (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  );

drop policy "own reserves" on public.reserves;
create policy "own reserves" on public.reserves for all to authenticated
  using (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  )
  with check (
    public.can_edit_raid(raid_id)
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  );

-- Instances and loot tables: admins only.
drop policy "officers" on public.instances;
create policy "admins" on public.instances for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy "officers" on public.loot_items;
create policy "admins" on public.loot_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Only admins make and remove officers (when officers aren't synced from Discord).
create or replace function public.set_officer(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change officers';
  end if;
  if not value and (select count(*) from public.profiles where is_officer and id <> target) = 0 then
    raise exception 'There must be at least one officer';
  end if;
  update public.profiles set is_officer = value where id = target;
end;
$$;

create function public.set_admin(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change admins';
  end if;
  if not value and (select count(*) from public.profiles where is_admin and id <> target) = 0 then
    raise exception 'There must be at least one admin';
  end if;
  update public.profiles set is_admin = value where id = target;
end;
$$;

revoke execute on function public.set_admin(uuid, boolean) from public, anon;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
