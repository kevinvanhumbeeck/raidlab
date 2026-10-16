-- Split raids (#60): several groups of the same instance on one night, at the same time. A split night is one raid
-- with `splits` > 1: one page, one sign-up per player, one lock and one Discord post. Each split has its own comp
-- and duties (raid lead, loot lead, ...). The existing unique (raid_id, character_id) on comp_slots keeps a
-- character in one split. Soft and hard reserves stay per raid; the loot page filters soft reserves per split by
-- who is placed there. Standing rosters (split_rosters) say which split a character usually raids in.
--
-- Undo:
-- drop table public.split_rosters;
-- drop trigger check_split on public.comp_slots; drop trigger check_split on public.raid_duties;
-- drop trigger check_splits on public.raids;
-- drop function public.check_split(); drop function public.check_splits();
-- delete from public.comp_slots where split_no > 1; delete from public.raid_duties where split_no > 1;
-- alter table public.comp_slots drop constraint comp_slots_pkey;
-- alter table public.comp_slots add primary key (raid_id, group_no, position);
-- alter table public.comp_slots drop column split_no;
-- alter table public.raid_duties drop constraint raid_duties_pkey;
-- alter table public.raid_duties add primary key (raid_id, duty);
-- alter table public.raid_duties drop column split_no;
-- alter table public.raids drop column splits;

alter table public.raids add column splits int not null default 1 check (splits between 1 and 4);

alter table public.comp_slots add column split_no int not null default 1 check (split_no between 1 and 4);
alter table public.comp_slots drop constraint comp_slots_pkey;
alter table public.comp_slots add primary key (raid_id, split_no, group_no, position);

alter table public.raid_duties add column split_no int not null default 1 check (split_no between 1 and 4);
alter table public.raid_duties drop constraint raid_duties_pkey;
alter table public.raid_duties add primary key (raid_id, split_no, duty);

-- Slots and duties only in splits the raid has.
create function public.check_split()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.split_no > (select splits from public.raids where id = new.raid_id) then
    raise exception 'This raid has no split %', new.split_no;
  end if;
  return new;
end;
$$;

create trigger check_split before insert or update on public.comp_slots
  for each row execute function public.check_split();
create trigger check_split before insert or update on public.raid_duties
  for each row execute function public.check_split();

-- A split can only be removed once it's empty.
create function public.check_splits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.comp_slots where raid_id = new.id and split_no > new.splits)
    or exists (select 1 from public.raid_duties where raid_id = new.id and split_no > new.splits) then
    raise exception 'Split % still has players', new.splits + 1;
  end if;
  return new;
end;
$$;

create trigger check_splits before update of splits on public.raids
  for each row when (new.splits < old.splits) execute function public.check_splits();

-- The split each character usually raids in, per instance. Officers keep it; exceptions are made per night on the
-- comp board.
create table public.split_rosters (
  instance text not null references public.instances (name) on update cascade on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  split_no int not null check (split_no between 1 and 4),
  primary key (instance, character_id)
);

alter table public.split_rosters enable row level security;
create policy "read" on public.split_rosters for select to authenticated using (public.is_member());
create policy "officers" on public.split_rosters for all to authenticated
  using (public.is_officer()) with check (public.is_officer());
