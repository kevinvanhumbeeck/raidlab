-- Merge the melee and ranged roles into a single "dps" role.

-- In case an earlier failed attempt left it behind.
drop type if exists public.raid_role_new;
create type public.raid_role_new as enum ('tank', 'healer', 'dps');

-- No spec has both melee and ranged, so this cannot produce a duplicate "dps".
alter table public.specs alter column roles type public.raid_role_new[] using (
  array_replace(array_replace(roles::text[], 'melee', 'dps'), 'ranged', 'dps')::public.raid_role_new[]
);

alter table public.comp_slots alter column role type public.raid_role_new using (
  case when role in ('melee', 'ranged') then 'dps' else role::text end::public.raid_role_new
);

drop type public.raid_role;
alter type public.raid_role_new rename to raid_role;

-- Instance requirements: one dps minimum instead of melee and ranged.
alter table public.instances add column dps int not null default 0 check (dps >= 0);
update public.instances set dps = melee + ranged;
alter table public.instances drop column melee, drop column ranged;
