-- Hard reserves (#46): officers keep items of a raid out of rolls. They stay listed on the Loot tab, visible to
-- everyone, but can't be soft-reserved. Exported to Gargul as `hardreserves`.
create table public.hard_reserves (
  raid_id uuid not null references public.raids(id) on delete cascade,
  item_id int not null references public.loot_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (raid_id, item_id)
);
create index hard_reserves_item_idx on public.hard_reserves (item_id);

alter table public.hard_reserves enable row level security;
create policy "read" on public.hard_reserves for select to authenticated using (public.is_member());
create policy "officers" on public.hard_reserves for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- The item must drop in the raid's instance.
create function public.check_hard_reserve()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  raid_instance text;
begin
  select instance into raid_instance from public.raids where id = new.raid_id;

  if not exists (select 1 from public.loot_items where id = new.item_id and instance = raid_instance) then
    raise exception 'This item does not drop in %', raid_instance;
  end if;

  return new;
end;
$$;

create trigger check_hard_reserve before insert on public.hard_reserves
  for each row execute function public.check_hard_reserve();

-- Hard-reserving an item drops its soft reserves.
create function public.drop_hard_reserved_soft_reserves()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.reserves where raid_id = new.raid_id and item_id = new.item_id;
  return null;
end;
$$;

create trigger drop_hard_reserved_soft_reserves after insert on public.hard_reserves
  for each row execute function public.drop_hard_reserved_soft_reserves();

-- As in 20261020000000, plus: nobody, officers included, can soft-reserve a hard-reserved item.
create or replace function public.check_reserve()
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

  if exists (select 1 from public.hard_reserves where raid_id = new.raid_id and item_id = new.item_id) then
    raise exception 'This item is hard-reserved';
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
