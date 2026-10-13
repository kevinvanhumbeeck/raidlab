-- WoW Forever raid manager: core schema

create type public.raid_role as enum ('tank', 'healer', 'melee', 'ranged');
create type public.signup_status as enum ('accepted', 'tentative', 'bench', 'absent');
create type public.attendance_status as enum ('present', 'late', 'benched', 'absent');
create type public.raid_duty as enum ('raid_lead', 'tank_assist', 'heal_assist', 'loot_lead');

-- Players (one per Discord login) -------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique,
  display_name text not null,
  avatar_url text,
  is_officer boolean not null default false,
  created_at timestamptz not null default now()
);

-- Copy Discord identity into a profile on first login.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, discord_id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    coalesce(
      new.raw_user_meta_data -> 'custom_claims' ->> 'global_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      'Unknown'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_officer()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_officer from public.profiles where id = auth.uid()), false);
$$;

-- Game data ------------------------------------------------------------------

create table public.classes (
  id text primary key,
  name text not null,
  color text not null
);

create table public.specs (
  id text primary key,
  class_id text not null references public.classes (id),
  name text not null,
  roles public.raid_role[] not null,
  unique (class_id, id)
);

-- Characters -----------------------------------------------------------------

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  class_id text not null references public.classes (id),
  main_spec_id text not null,
  off_spec_ids text[] not null default '{}',
  is_main boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (class_id, main_spec_id) references public.specs (class_id, id)
);

create unique index characters_name_key on public.characters (lower(name));

-- Raids ----------------------------------------------------------------------

create table public.raids (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instance text not null,
  size int not null check (size in (10, 20, 40)),
  starts_at timestamptz not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.signups (
  raid_id uuid not null references public.raids (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  status public.signup_status not null default 'accepted',
  spec_id text references public.specs (id),
  note text,
  updated_at timestamptz not null default now(),
  primary key (raid_id, character_id)
);

-- Group/position slots. Unique (raid, character) stops someone being placed twice.
create table public.comp_slots (
  raid_id uuid not null references public.raids (id) on delete cascade,
  group_no int not null check (group_no between 1 and 8),
  position int not null check (position between 1 and 5),
  character_id uuid not null references public.characters (id) on delete cascade,
  spec_id text references public.specs (id),
  primary key (raid_id, group_no, position),
  unique (raid_id, character_id)
);

create table public.raid_duties (
  raid_id uuid not null references public.raids (id) on delete cascade,
  duty public.raid_duty not null,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (raid_id, duty)
);

create table public.attendance (
  raid_id uuid not null references public.raids (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  status public.attendance_status not null,
  primary key (raid_id, character_id)
);

-- Row level security ---------------------------------------------------------
-- Everyone logged in can read everything; players edit their own characters
-- and sign-ups; officers manage raids, comps, duties and attendance.

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.specs enable row level security;
alter table public.characters enable row level security;
alter table public.raids enable row level security;
alter table public.signups enable row level security;
alter table public.comp_slots enable row level security;
alter table public.raid_duties enable row level security;
alter table public.attendance enable row level security;

create policy "read" on public.profiles for select to authenticated using (true);
create policy "read" on public.classes for select to authenticated using (true);
create policy "read" on public.specs for select to authenticated using (true);
create policy "read" on public.characters for select to authenticated using (true);
create policy "read" on public.raids for select to authenticated using (true);
create policy "read" on public.signups for select to authenticated using (true);
create policy "read" on public.comp_slots for select to authenticated using (true);
create policy "read" on public.raid_duties for select to authenticated using (true);
create policy "read" on public.attendance for select to authenticated using (true);

-- Players may rename themselves, but not promote themselves to officer.
create policy "update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "own characters" on public.characters for all to authenticated
  using (owner_id = auth.uid() or public.is_officer())
  with check (owner_id = auth.uid() or public.is_officer());

create policy "own signups" on public.signups for all to authenticated
  using (
    public.is_officer()
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  )
  with check (
    public.is_officer()
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid())
  );

create policy "officers" on public.raids for all to authenticated
  using (public.is_officer()) with check (public.is_officer());
create policy "officers" on public.comp_slots for all to authenticated
  using (public.is_officer()) with check (public.is_officer());
create policy "officers" on public.raid_duties for all to authenticated
  using (public.is_officer()) with check (public.is_officer());
create policy "officers" on public.attendance for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- Live updates for the composition board.
alter publication supabase_realtime add table public.comp_slots, public.signups;
