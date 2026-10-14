-- Soft reserves (#9): players reserve items from their raid's loot table, officers export the reserves to
-- Gargul. Ragefire Chasm is a 5-man stand-in for testing until the Forever raid loot tables are known.

alter table public.instances drop constraint instances_size_check;
alter table public.instances add constraint instances_size_check check (size in (5, 10, 20, 40));
alter table public.raids drop constraint raids_size_check;
alter table public.raids add constraint raids_size_check check (size in (5, 10, 20, 40));

-- Reserves per character per raid.
alter table public.instances add column reserves int not null default 2 check (reserves >= 0);

insert into public.instances (name, size, tanks, healers, dps, reserves, sort) values
  ('Ragefire Chasm', 5, 1, 1, 0, 2, 0)
on conflict (name) do nothing;

-- An instance's loot table. id is the in-game item ID (what Gargul and Wowhead use).
create table public.loot_items (
  id int primary key check (id > 0),
  instance text not null references public.instances(name) on update cascade on delete cascade,
  boss text,
  name text not null,
  quality smallint not null default 3 check (quality between 0 and 7),
  icon text,
  sort int not null default 0
);
create index loot_items_instance_idx on public.loot_items (instance);

alter table public.loot_items enable row level security;
create policy "read" on public.loot_items for select to authenticated using (public.is_member());
create policy "officers" on public.loot_items for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- A reserve needs a sign-up: withdrawing removes the character's reserves.
create table public.reserves (
  raid_id uuid not null,
  character_id uuid not null,
  item_id int not null references public.loot_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (raid_id, character_id, item_id),
  foreign key (raid_id, character_id) references public.signups(raid_id, character_id) on delete cascade
);
create index reserves_item_idx on public.reserves (item_id);

alter table public.reserves enable row level security;
create policy "read" on public.reserves for select to authenticated using (public.is_member());
create policy "own reserves" on public.reserves for all to authenticated
  using (
    public.is_officer()
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  )
  with check (
    public.is_officer()
    or (
      public.is_member()
      and public.raid_open(raid_id)
      and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
    )
  );

-- The item must drop in the raid's instance, absent players can't reserve, and players stay within the
-- instance's limit (officers may go over it).
create function public.check_reserve()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  raid_instance text;
  max_reserves int;
begin
  select r.instance, i.reserves into raid_instance, max_reserves
    from public.raids r join public.instances i on i.name = r.instance
    where r.id = new.raid_id;

  if not exists (select 1 from public.loot_items where id = new.item_id and instance = raid_instance) then
    raise exception 'This item does not drop in %', raid_instance;
  end if;

  if exists (
    select 1 from public.signups
    where raid_id = new.raid_id and character_id = new.character_id and status = 'absent'
  ) then
    raise exception 'Absent characters cannot reserve';
  end if;

  if not public.is_officer() and (
    select count(*) from public.reserves where raid_id = new.raid_id and character_id = new.character_id
  ) >= max_reserves then
    raise exception 'Reserve limit reached (%)', max_reserves;
  end if;

  return new;
end;
$$;

create trigger check_reserve before insert on public.reserves
  for each row execute function public.check_reserve();

-- Signing off (absent) drops the character's reserves.
create function public.drop_absent_reserves()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.reserves where raid_id = new.raid_id and character_id = new.character_id;
  return null;
end;
$$;

create trigger drop_absent_reserves after update of status on public.signups
  for each row when (new.status = 'absent' and old.status <> 'absent')
  execute function public.drop_absent_reserves();

-- Ragefire Chasm loot on Wowhead's Forever database.
insert into public.loot_items (id, instance, boss, name, quality, icon, sort) values
  (272996, 'Ragefire Chasm', 'Oggleflint',             'Trogg Scepter',       3, 'inv_misc_bone_10',          1),
  (272998, 'Ragefire Chasm', 'Oggleflint',             'Bone Knuckles',       3, 'ability_whirlwind',         2),
  (272999, 'Ragefire Chasm', 'Oggleflint',             'Barbaric Crossbow',   3, 'inv_weapon_crossbow_02',    3),
  (14147,  'Ragefire Chasm', 'Jergosh the Invoker',    'Cavedweller Bracers', 3, 'inv_bracer_07',             4),
  (14150,  'Ragefire Chasm', 'Jergosh the Invoker',    'Robe of Evocation',   3, 'inv_chest_cloth_24',        5),
  (14151,  'Ragefire Chasm', 'Jergosh the Invoker',    'Chanting Blade',      3, 'inv_weapon_shortblade_25',  6),
  (273003, 'Ragefire Chasm', 'Bazzalan',               'Searing Dagger',      3, 'inv_weapon_shortblade_03',  7),
  (273005, 'Ragefire Chasm', 'Bazzalan',               'Satyrskin Cloak',     3, 'inv_misc_cape_18',          8),
  (273007, 'Ragefire Chasm', 'Bazzalan',               'Chasm Walkers',       3, 'inv_boots_06',              9),
  (14145,  'Ragefire Chasm', 'Taragaman the Hungerer', 'Cursed Felblade',     3, 'inv_weapon_shortblade_12', 10),
  (14148,  'Ragefire Chasm', 'Taragaman the Hungerer', 'Crystalline Cuffs',   3, 'inv_bracer_13',            11),
  (14149,  'Ragefire Chasm', 'Taragaman the Hungerer', 'Subterranean Cape',   3, 'inv_misc_cape_18',         12)
on conflict (id) do nothing;
