-- Removes everything created by sample_data.sql.
-- Deleting the fake users cascades to their profiles, characters, sign-ups and comp slots.

delete from public.raids where title like '[Sample]%';
delete from auth.users where email like '%@sample.raidlab.invalid';
