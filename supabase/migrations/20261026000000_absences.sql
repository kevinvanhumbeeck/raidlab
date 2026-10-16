-- Absences (#50): a player marks a date range as away once, and every open raid in that range gets a
-- declined sign-up for their main. This also applies to raids created later. A sign-up the player
-- (or an officer) makes themselves clears absence_id, so it isn't touched when the absence changes.
--
-- Undo:
--   drop trigger apply_absences on public.raids;
--   drop table public.absences cascade;  -- also drops signups.absence_id's foreign key
--   alter table public.signups drop column absence_id;
--   drop function public.raid_absences(); drop function public.absence_removed(); drop function public.absence_saved();
--   drop function public.apply_absences(uuid, uuid);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index on public.absences (profile_id, ends_on);

alter table public.absences enable row level security;

create policy "read" on public.absences for select to authenticated using (public.is_member());
create policy "own absences" on public.absences for all to authenticated
  using (public.is_officer() or (public.is_member() and profile_id = auth.uid()))
  with check (public.is_officer() or (public.is_member() and profile_id = auth.uid()));

-- Set null, not cascade: deleting an absence keeps the declines of raids that already happened.
alter table public.signups add column absence_id uuid references public.absences (id) on delete set null;

-- Declined sign-ups for open, upcoming raids within an absence, for the player's main (or oldest
-- character). Players who already have a sign-up for the raid keep it. Raid dates are in realm time
-- (REALM_TIMEZONE in src/lib/wow.ts).
create function public.apply_absences(only_raid uuid, only_absence uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.signups (raid_id, character_id, status, note, absence_id)
  select distinct on (r.id, a.profile_id)
    r.id, c.id, 'declined', 'Away' || coalesce(': ' || nullif(a.note, ''), ''), a.id
  from public.absences a
  join public.raids r on (r.starts_at at time zone 'Europe/Paris')::date between a.starts_on and a.ends_on
  join public.characters c on c.owner_id = a.profile_id
  where (only_raid is null or r.id = only_raid)
    and (only_absence is null or a.id = only_absence)
    and r.starts_at > now()
    and public.raid_open(r.id)
    and not exists (
      select 1 from public.signups s join public.characters o on o.id = s.character_id
      where s.raid_id = r.id and o.owner_id = a.profile_id
    )
  order by r.id, a.profile_id, c.is_main desc, c.created_at
  on conflict do nothing;
$$;

create function public.raid_absences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_absences(new.id, null);
  return null;
end;
$$;

create trigger apply_absences after insert on public.raids
  for each row execute function public.raid_absences();

-- A changed or deleted absence first removes the declines it made for open, upcoming raids (before the
-- delete, while signups.absence_id still points to it), then a new or changed one applies its dates.
create function public.absence_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.signups s using public.raids r
  where s.absence_id = old.id and r.id = s.raid_id and r.starts_at > now() and public.raid_open(r.id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger absence_removed before update or delete on public.absences
  for each row execute function public.absence_removed();

create function public.absence_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_absences(null, new.id);
  return null;
end;
$$;

create trigger absence_saved after insert or update on public.absences
  for each row execute function public.absence_saved();
