-- Restrict the app to members of the guild's Discord server, and let officers
-- manage officers and members from the app.

alter table public.profiles add column is_member boolean not null default false;

-- Everyone who registered before this restriction keeps access.
update public.profiles set is_member = true;

create function public.is_member()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_member or is_officer from public.profiles where id = auth.uid()), false);
$$;

-- Reads: members only (players can always see their own profile).
drop policy "read" on public.profiles;
drop policy "read" on public.classes;
drop policy "read" on public.specs;
drop policy "read" on public.characters;
drop policy "read" on public.raids;
drop policy "read" on public.signups;
drop policy "read" on public.comp_slots;
drop policy "read" on public.raid_duties;
drop policy "read" on public.attendance;

create policy "read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_member());
create policy "read" on public.classes for select to authenticated using (public.is_member());
create policy "read" on public.specs for select to authenticated using (public.is_member());
create policy "read" on public.characters for select to authenticated using (public.is_member());
create policy "read" on public.raids for select to authenticated using (public.is_member());
create policy "read" on public.signups for select to authenticated using (public.is_member());
create policy "read" on public.comp_slots for select to authenticated using (public.is_member());
create policy "read" on public.raid_duties for select to authenticated using (public.is_member());
create policy "read" on public.attendance for select to authenticated using (public.is_member());

-- Writes by players: members only.
drop policy "own characters" on public.characters;
create policy "own characters" on public.characters for all to authenticated
  using ((owner_id = auth.uid() and public.is_member()) or public.is_officer())
  with check ((owner_id = auth.uid() and public.is_member()) or public.is_officer());

drop policy "own signups" on public.signups;
create policy "own signups" on public.signups for all to authenticated
  using (
    public.is_officer()
    or (public.is_member() and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  )
  with check (
    public.is_officer()
    or (public.is_member() and exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  );

-- Officer management. Functions instead of column grants, so players can't
-- promote themselves through the "update own profile" policy.
create function public.set_officer(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_officer() then
    raise exception 'Only officers can change officers';
  end if;
  if not value and (select count(*) from public.profiles where is_officer and id <> target) = 0 then
    raise exception 'There must be at least one officer';
  end if;
  update public.profiles set is_officer = value where id = target;
end;
$$;

create function public.set_member(target uuid, value boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_officer() then
    raise exception 'Only officers can change members';
  end if;
  update public.profiles set is_member = value where id = target;
end;
$$;

revoke execute on function public.set_officer(uuid, boolean) from public, anon;
revoke execute on function public.set_member(uuid, boolean) from public, anon;
grant execute on function public.set_officer(uuid, boolean) to authenticated;
grant execute on function public.set_member(uuid, boolean) to authenticated;
