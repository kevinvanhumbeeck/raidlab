-- Lets the API join reserves to characters (the sign-up foreign key alone doesn't).
alter table public.reserves
  add constraint reserves_character_id_fkey foreign key (character_id) references public.characters(id) on delete cascade;
