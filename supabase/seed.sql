-- WoW Forever classes and talent specs.
-- Assumes the classic 9-class / 3-tree layout; adjust if the beta differs.

insert into public.classes (id, name, color) values
  ('druid',   'Druid',   '#FF7C0A'),
  ('hunter',  'Hunter',  '#AAD372'),
  ('mage',    'Mage',    '#3FC7EB'),
  ('paladin', 'Paladin', '#F48CBA'),
  ('priest',  'Priest',  '#FFFFFF'),
  ('rogue',   'Rogue',   '#FFF468'),
  ('shaman',  'Shaman',  '#0070DD'),
  ('warlock', 'Warlock', '#8788EE'),
  ('warrior', 'Warrior', '#C69B6D')
on conflict (id) do update set name = excluded.name, color = excluded.color;

insert into public.specs (id, class_id, name, roles) values
  ('druid_balance',         'druid',   'Balance',       '{dps}'),
  ('druid_feral',           'druid',   'Feral',         '{dps,tank}'),
  ('druid_restoration',     'druid',   'Restoration',   '{healer}'),
  ('hunter_beastmastery',   'hunter',  'Beast Mastery', '{dps}'),
  ('hunter_marksmanship',   'hunter',  'Marksmanship',  '{dps}'),
  ('hunter_survival',       'hunter',  'Survival',      '{dps}'),
  ('mage_arcane',           'mage',    'Arcane',        '{dps}'),
  ('mage_fire',             'mage',    'Fire',          '{dps}'),
  ('mage_frost',            'mage',    'Frost',         '{dps}'),
  ('paladin_holy',          'paladin', 'Holy',          '{healer}'),
  ('paladin_protection',    'paladin', 'Protection',    '{tank}'),
  ('paladin_retribution',   'paladin', 'Retribution',   '{dps}'),
  ('priest_discipline',     'priest',  'Discipline',    '{healer}'),
  ('priest_holy',           'priest',  'Holy',          '{healer}'),
  ('priest_shadow',         'priest',  'Shadow',        '{dps}'),
  ('rogue_assassination',   'rogue',   'Assassination', '{dps}'),
  ('rogue_combat',          'rogue',   'Combat',        '{dps}'),
  ('rogue_subtlety',        'rogue',   'Subtlety',      '{dps}'),
  ('shaman_elemental',      'shaman',  'Elemental',     '{dps}'),
  ('shaman_enhancement',    'shaman',  'Enhancement',   '{dps}'),
  ('shaman_restoration',    'shaman',  'Restoration',   '{healer}'),
  ('warlock_affliction',    'warlock', 'Affliction',    '{dps}'),
  ('warlock_demonology',    'warlock', 'Demonology',    '{dps}'),
  ('warlock_destruction',   'warlock', 'Destruction',   '{dps}'),
  ('warrior_arms',          'warrior', 'Arms',          '{dps}'),
  ('warrior_fury',          'warrior', 'Fury',          '{dps}'),
  ('warrior_protection',    'warrior', 'Protection',    '{tank}')
on conflict (id) do update set class_id = excluded.class_id, name = excluded.name, roles = excluded.roles;

-- Raid instances and their minimum role requirements (also created by the instance_requirements migration).
insert into public.instances (name, size, tanks, healers, dps, sort) values
  ('Ragefire Chasm',  5, 1, 1,  0, 0),
  ('Barrow Deeps',  10, 2, 3,  4, 1),
  ('Hyjal Summit',  20, 3, 5, 10, 2),
  ('Onyxia''s Lair', 40, 3, 9, 24, 3)
on conflict (name) do nothing;
