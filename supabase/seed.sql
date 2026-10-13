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
  ('druid_balance',         'druid',   'Balance',       '{ranged}'),
  ('druid_feral',           'druid',   'Feral',         '{melee,tank}'),
  ('druid_restoration',     'druid',   'Restoration',   '{healer}'),
  ('hunter_beastmastery',   'hunter',  'Beast Mastery', '{ranged}'),
  ('hunter_marksmanship',   'hunter',  'Marksmanship',  '{ranged}'),
  ('hunter_survival',       'hunter',  'Survival',      '{ranged}'),
  ('mage_arcane',           'mage',    'Arcane',        '{ranged}'),
  ('mage_fire',             'mage',    'Fire',          '{ranged}'),
  ('mage_frost',            'mage',    'Frost',         '{ranged}'),
  ('paladin_holy',          'paladin', 'Holy',          '{healer}'),
  ('paladin_protection',    'paladin', 'Protection',    '{tank}'),
  ('paladin_retribution',   'paladin', 'Retribution',   '{melee}'),
  ('priest_discipline',     'priest',  'Discipline',    '{healer}'),
  ('priest_holy',           'priest',  'Holy',          '{healer}'),
  ('priest_shadow',         'priest',  'Shadow',        '{ranged}'),
  ('rogue_assassination',   'rogue',   'Assassination', '{melee}'),
  ('rogue_combat',          'rogue',   'Combat',        '{melee}'),
  ('rogue_subtlety',        'rogue',   'Subtlety',      '{melee}'),
  ('shaman_elemental',      'shaman',  'Elemental',     '{ranged}'),
  ('shaman_enhancement',    'shaman',  'Enhancement',   '{melee}'),
  ('shaman_restoration',    'shaman',  'Restoration',   '{healer}'),
  ('warlock_affliction',    'warlock', 'Affliction',    '{ranged}'),
  ('warlock_demonology',    'warlock', 'Demonology',    '{ranged}'),
  ('warlock_destruction',   'warlock', 'Destruction',   '{ranged}'),
  ('warrior_arms',          'warrior', 'Arms',          '{melee}'),
  ('warrior_fury',          'warrior', 'Fury',          '{melee}'),
  ('warrior_protection',    'warrior', 'Protection',    '{tank}')
on conflict (id) do update set class_id = excluded.class_id, name = excluded.name, roles = excluded.roles;
