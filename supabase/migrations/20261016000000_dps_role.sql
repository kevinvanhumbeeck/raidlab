-- Merge the melee and ranged roles into a single "dps" role.

create type public.raid_role_new as enum ('tank', 'healer', 'dps');

alter table public.specs alter column roles type public.raid_role_new[] using (
  array(
    select (case when r in ('melee', 'ranged') then 'dps' else r::text end)::public.raid_role_new
    from unnest(roles) with ordinality as u(r, i)
    order by i
  )
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
