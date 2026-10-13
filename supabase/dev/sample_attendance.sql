-- Past raids with sign-ups, comps and attendance for the sample players, to show off
-- the attendance page. Run sample_data.sql first. Removed by remove_sample_data.sql.
--
-- Alternates Hyjal Summit (20) and Barrow Deeps (10), one raid every 4 days going back
-- 40 days. Each player gets a reliability: the sheet's core 15 show up most, standby
-- players less, the rest least. Results are deterministic, so re-running gives the same mix.

do $$
declare
  raid uuid;
  i int;
  raid_size int;
  inst text;
  placed int;
  ch record;
  roll int;
  reliability int;
  st public.attendance_status;
begin
  -- Count the sample players as members since before the first sample raid.
  update public.profiles p
  set created_at = now() - interval '90 days'
  from auth.users u
  where u.id = p.id and u.email like '%@sample.raidlab.invalid';

  for i in 1..10 loop
    if i % 2 = 0 then
      inst := 'Barrow Deeps';
      raid_size := 10;
    else
      inst := 'Hyjal Summit';
      raid_size := 20;
    end if;

    insert into public.raids (title, instance, size, starts_at, notes)
    values (
      '[Sample] ' || inst || ' #' || (11 - i),
      inst,
      raid_size,
      date_trunc('day', now()) - make_interval(days => i * 4) + interval '18 hours 30 minutes',
      'Sample past raid — safe to delete'
    )
    returning id into raid;

    placed := 0;
    for ch in
      select c.id, c.name, c.main_spec_id
      from public.characters c
      join auth.users u on u.id = c.owner_id
      where u.email like '%@sample.raidlab.invalid'
      order by hashtext(c.name || '#' || i)
    loop
      reliability := case
        when ch.name in ('Avaiche', 'Craigyboy', 'Eryce', 'Sproog', 'Ambrosius', 'Deapek', 'Kaffe', 'Skaapje',
                         'Clara', 'Vriendin Rinoa', 'Muto', 'Kekke', 'Jamienism', 'Braggers', 'Freija') then 88
        when ch.name in ('Phex Vader', 'Rinoa', 'Jacko') then 65
        else 45
      end;
      roll := abs(hashtext(ch.name || ':' || i)) % 100;

      if roll < reliability then
        st := case when roll % 9 = 0 then 'late' else 'present' end;
      elsif roll < reliability + 15 then
        st := 'benched';
      else
        st := 'absent';
      end if;

      -- Raid full: extra players sit on the bench.
      if st in ('present', 'late') and placed >= raid_size then
        st := 'benched';
      end if;

      if st in ('present', 'late') then
        insert into public.comp_slots (raid_id, group_no, position, character_id, spec_id)
        values (raid, placed / 5 + 1, placed % 5 + 1, ch.id, ch.main_spec_id);
        placed := placed + 1;
      end if;

      insert into public.signups (raid_id, character_id, status, spec_id)
      values (
        raid,
        ch.id,
        case st when 'benched' then 'bench' when 'absent' then 'absent' else 'accepted' end::public.signup_status,
        ch.main_spec_id
      );

      insert into public.attendance (raid_id, character_id, status)
      values (raid, ch.id, st);
    end loop;

    insert into public.raid_duties (raid_id, duty, character_id)
    select raid, 'raid_lead', c.id from public.characters c where lower(c.name) = 'freija';
  end loop;
end $$;
