-- Readable URLs: /raids/2026-12-09-onyxias-lair and /players/kevin instead of UUIDs.
-- Slugs are set once on insert and don't follow later renames, so links keep working.

create extension if not exists unaccent with schema extensions;

create function public.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

-- First free slug among base, base-2, base-3, ... in the given table.
create function public.unique_slug(tbl regclass, base text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text := base;
  n int := 1;
  taken boolean;
begin
  loop
    execute format('select exists (select 1 from %s where slug = $1)', tbl) into taken using candidate;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

create function public.set_raid_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is null then
    new.slug := public.unique_slug(
      'public.raids',
      to_char(new.starts_at at time zone 'Europe/Paris', 'YYYY-MM-DD')
        || coalesce('-' || nullif(public.slugify(new.title), ''), '')
    );
  end if;
  return new;
end;
$$;

create function public.set_profile_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is null then
    new.slug := public.unique_slug('public.profiles', coalesce(nullif(public.slugify(new.display_name), ''), 'player'));
  end if;
  return new;
end;
$$;

alter table public.raids add column slug text unique;
alter table public.profiles add column slug text unique;

create trigger set_slug before insert or update on public.raids
  for each row execute function public.set_raid_slug();
create trigger set_slug before insert or update on public.profiles
  for each row execute function public.set_profile_slug();

-- Backfill: the update fires the trigger, oldest first so the original keeps the plain slug.
do $$
declare r record;
begin
  for r in select id from public.raids order by created_at loop
    update public.raids set slug = null where id = r.id;
  end loop;
  for r in select id from public.profiles order by created_at loop
    update public.profiles set slug = null where id = r.id;
  end loop;
end;
$$;

alter table public.raids alter column slug set not null;
alter table public.profiles alter column slug set not null;
