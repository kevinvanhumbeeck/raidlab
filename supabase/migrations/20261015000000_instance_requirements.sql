-- Raid instances with minimum role requirements, and per-raid role choice for hybrids.

create table public.instances (
  name text primary key,
  size int not null check (size in (10, 20, 40)),
  tanks int not null default 0 check (tanks >= 0),
  healers int not null default 0 check (healers >= 0),
  melee int not null default 0 check (melee >= 0),
  ranged int not null default 0 check (ranged >= 0),
  sort int not null default 0
);

-- Whatever is left of the raid size is flexible DPS.
insert into public.instances (name, size, tanks, healers, melee, ranged, sort) values
  ('Barrow Deeps',  10, 2, 3,  2,  2, 1),
  ('Hyjal Summit',  20, 3, 5,  5,  5, 2),
  ('Onyxia''s Lair', 40, 3, 9, 12, 12, 3)
on conflict (name) do nothing;

alter table public.raids
  add constraint raids_instance_fkey foreign key (instance) references public.instances (name) on update cascade;

-- The role a placed character fills in this raid; null means the spec's first role.
alter table public.comp_slots add column role public.raid_role;

alter table public.instances enable row level security;
create policy "read" on public.instances for select to authenticated using (public.is_member());
create policy "officers" on public.instances for all to authenticated
  using (public.is_officer()) with check (public.is_officer());
