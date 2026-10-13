-- Sample data mirroring the "WoW Forever" tab of the guild spreadsheet (9 Dec, 20 main):
-- players, characters with the sheet's specs, a raid with sign-ups, the sheet's groups and duties.
-- Fake players use @sample.raidlab.invalid emails and cannot log in.
-- Remove everything with supabase/dev/remove_sample_data.sql.
-- If a character with the same name already exists (a real player registered it), that one is reused.

do $$
declare
  r record;
  raid uuid;
  player uuid;
  ch uuid;
  n int := 0;
begin
  insert into public.raids (title, instance, size, starts_at, notes)
  values ('[Sample] Hyjal Summit', 'Hyjal Summit', 20, '2026-12-09 18:30:00+00', 'Copied from the spreadsheet — safe to delete')
  returning id into raid;

  for r in
    select * from (values
      -- character,       class,     main spec,              off-specs,                                    status,      group, pos
      ('Avaiche',         'warrior', 'warrior_protection',   '{}'::text[],                                 'accepted',  1, 1),
      ('Craigyboy',       'rogue',   'rogue_combat',         '{}',                                         'accepted',  1, 2),
      ('Eryce',           'hunter',  'hunter_beastmastery',  '{}',                                         'accepted',  1, 3),
      ('Sproog',          'shaman',  'shaman_enhancement',   '{}',                                         'accepted',  1, 4),
      ('Ambrosius',       'paladin', 'paladin_protection',   '{paladin_holy}',                             'accepted',  2, 1),
      ('Deapek',          'warrior', 'warrior_arms',         '{}',                                         'accepted',  2, 2),
      ('Kaffe',           'paladin', 'paladin_retribution',  '{}',                                         'accepted',  2, 3),
      ('Skaapje',         'paladin', 'paladin_retribution',  '{paladin_holy}',                             'accepted',  2, 4),
      ('Clara',           'shaman',  'shaman_enhancement',   '{shaman_restoration}',                       'accepted',  2, 5),
      ('Vriendin Rinoa',  'druid',   'druid_restoration',    '{druid_balance}',                            'accepted',  3, 1),
      ('Muto',            'warlock', 'warlock_destruction',  '{}',                                         'accepted',  3, 3),
      ('Kekke',           'priest',  'priest_discipline',    '{}',                                         'accepted',  4, 1),
      ('Jamienism',       'druid',   'druid_restoration',    '{}',                                         'accepted',  4, 2),
      ('Braggers',        'shaman',  'shaman_restoration',   '{}',                                         'accepted',  4, 3),
      ('Freija',          'priest',  'priest_discipline',    '{priest_holy,priest_shadow}',                'accepted',  4, 4),
      -- Standby
      ('Phex Vader',      'warlock', 'warlock_destruction',  '{}',                                         'bench',     null, null),
      ('Rinoa',           'hunter',  'hunter_beastmastery',  '{}',                                         'bench',     null, null),
      ('Jacko',           'hunter',  'hunter_beastmastery',  '{}',                                         'bench',     null, null),
      -- On the roster but not in a group
      ('Jazz',            'druid',   'druid_balance',        '{druid_restoration}',                        'tentative', null, null),
      ('Tristesse',       'rogue',   'rogue_combat',         '{}',                                         'tentative', null, null),
      ('Pagge',           'shaman',  'shaman_enhancement',   '{}',                                         'tentative', null, null)
    ) as t(character_name, class_id, main_spec_id, off_spec_ids, status, group_no, pos)
  loop
    select id into ch from public.characters where lower(name) = lower(r.character_name);

    if ch is null then
      n := n + 1;
      player := gen_random_uuid();

      -- The on_auth_user_created trigger creates the matching profile.
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (
        player, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'sample' || n || '@sample.raidlab.invalid',
        '{"provider": "sample"}', jsonb_build_object('full_name', r.character_name), now(), now()
      );

      insert into public.characters (owner_id, name, class_id, main_spec_id, off_spec_ids, is_main)
      values (player, r.character_name, r.class_id, r.main_spec_id, r.off_spec_ids, true)
      returning id into ch;
    end if;

    insert into public.signups (raid_id, character_id, status, spec_id)
    values (raid, ch, r.status::public.signup_status, r.main_spec_id);

    if r.group_no is not null then
      insert into public.comp_slots (raid_id, group_no, position, character_id, spec_id)
      values (raid, r.group_no, r.pos, ch, r.main_spec_id);
    end if;
  end loop;

  insert into public.raid_duties (raid_id, duty, character_id)
  select raid, d.duty::public.raid_duty, c.id
  from (values ('raid_lead', 'Freija'), ('loot_lead', 'Eryce')) as d(duty, name)
  join public.characters c on lower(c.name) = lower(d.name);
end $$;
