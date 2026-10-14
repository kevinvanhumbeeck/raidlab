-- Locking a raid (#24): from locked_at on, players can no longer add, change or remove their own
-- sign-ups. Officers still can. New raids lock when they start; officers can lock earlier
-- (locked_at = now) or reopen a raid (locked_at = null, so it stays open until locked again).

alter table public.raids add column locked_at timestamptz;

update public.raids set locked_at = starts_at;

create function public.set_raid_locked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.locked_at := coalesce(new.locked_at, new.starts_at);
  return new;
end;
$$;

create trigger set_locked_at before insert on public.raids
  for each row execute function public.set_raid_locked_at();

create function public.raid_open(raid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select locked_at is null or locked_at > now() from public.raids where id = raid), false);
$$;

drop policy "own signups" on public.signups;
create policy "own signups" on public.signups for all to authenticated
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
