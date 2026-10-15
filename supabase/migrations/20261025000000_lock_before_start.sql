-- Sign-ups close 1 hour before a raid starts instead of at the start (the sign-up deadline, #61).
-- Upcoming raids still on the old default (locked_at = starts_at) move to the new one.
--
-- Undo: restore set_raid_locked_at from 20261018000000 and
-- update public.raids set locked_at = starts_at where locked_at = starts_at - interval '1 hour' and starts_at > now();

create or replace function public.set_raid_locked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.locked_at := coalesce(new.locked_at, new.starts_at - interval '1 hour');
  return new;
end;
$$;

update public.raids set locked_at = starts_at - interval '1 hour'
where locked_at = starts_at and starts_at > now() + interval '1 hour';
