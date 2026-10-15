-- Fixed tank and healer counts per instance; DPS is the rest of the raid (#27, decided with the raid lead):
-- 2 tanks in every raid, and 2 / 4 / 6 healers in 10 / 20 / 40. instances.dps becomes a generated column,
-- so it can't disagree with the size any more and readers of it keep working.
--
-- Undo:
-- alter table public.instances drop constraint instances_roles_fit;
-- alter table public.instances drop column dps;
-- alter table public.instances add column dps int not null default 0 check (dps >= 0);
-- update public.instances set dps = size - tanks - healers;
-- update public.instances set tanks = 2, healers = 3, dps = 4 where size = 10;
-- update public.instances set tanks = 3, healers = 5, dps = 10 where size = 20;
-- update public.instances set tanks = 3, healers = 9, dps = 24 where size = 40;

update public.instances set tanks = 2, healers = case size when 10 then 2 when 20 then 4 else 6 end
where size in (10, 20, 40);

alter table public.instances drop column dps;
alter table public.instances add constraint instances_roles_fit check (tanks + healers <= size);
alter table public.instances add column dps int generated always as (size - tanks - healers) stored;
