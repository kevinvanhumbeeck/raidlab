-- Simpler states (#61). A sign-up is accepted or declined; no sign-up means no response. Bench is an
-- officer decision (signed up but not placed in the comp), and tentative is replaced by the sign-up
-- deadline (the raid lock). Attendance drops "late", which counted as present anyway.
--
-- Undo: recreate the old enums ('accepted', 'tentative', 'bench', 'absent') and
-- ('present', 'late', 'benched', 'absent', 'no_show') the same way, mapping declined -> absent, and
-- restore check_reserve and drop_absent_reserves from 20261023000000 and 20261020000000. Tentative,
-- bench and late can't be told apart again after this runs.

-- The trigger's WHEN clause depends on the column type, so it goes first.
drop trigger drop_absent_reserves on public.signups;
drop function public.drop_absent_reserves();

create type public.signup_status_new as enum ('accepted', 'declined');
alter table public.signups alter column status drop default;
alter table public.signups alter column status type public.signup_status_new using (
  case status::text when 'absent' then 'declined' else 'accepted' end::public.signup_status_new
);
alter table public.signups alter column status set default 'accepted';
drop type public.signup_status;
alter type public.signup_status_new rename to signup_status;

create type public.attendance_status_new as enum ('present', 'benched', 'absent', 'no_show');
alter table public.attendance alter column status type public.attendance_status_new using (
  case status::text when 'late' then 'present' else status::text end::public.attendance_status_new
);
drop type public.attendance_status;
alter type public.attendance_status_new rename to attendance_status;

-- As in 20261023000000, with declined instead of absent.
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
    where raid_id = new.raid_id and character_id = new.character_id and status = 'declined'
  ) then
    raise exception 'Declined characters cannot reserve';
  end if;

  if not public.is_officer() and (
    select count(*) from public.reserves where raid_id = new.raid_id and character_id = new.character_id
  ) >= max_reserves then
    raise exception 'Reserve limit reached (%)', max_reserves;
  end if;

  return new;
end;
$$;

-- Declining drops the character's reserves.
create function public.drop_declined_reserves()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.reserves where raid_id = new.raid_id and character_id = new.character_id;
  return null;
end;
$$;

create trigger drop_declined_reserves after update of status on public.signups
  for each row when (new.status = 'declined' and old.status <> 'declined')
  execute function public.drop_declined_reserves();
