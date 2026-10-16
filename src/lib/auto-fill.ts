import { FIXED_ROLES, ROLE_NAMES, type Role, type RoleRequirements } from "@/lib/wow";

// Auto-fill (#55): a draft comp from the accepted sign-ups, filling only the empty slots. Officers review it on
// the comp board and accept it or not. Rules, in order:
//   1. Raid duties first: whoever holds one gets a spot in that split.
//   2. On a split night, standing roster members go to their own split.
//   3. Then anyone, to any split.
// Within each step the tanks and healers each split still needs come first (offspecs included), then DPS for the
// rest. Higher attendance wins a contested spot, then mains before alts. Spots left over at the end take whoever is
// left, in their own role, rather than staying empty.

export type FillCandidate = {
  id: string;
  name: string;
  isMain: boolean;
  // Attendance percentage, or null without recorded raids.
  attendance: number | null;
  // Split from the standing roster, and split where they hold a duty.
  rosterSplit: number | null;
  dutySplit: number | null;
  // Roles the character can fill and the spec for each; the first is the signed-up spec's own role.
  options: { role: Role; specId: string }[];
};

export type PlacedSlot = { splitNo: number; groupNo: number; position: number; role: Role };

export type FilledSlot = PlacedSlot & { characterId: string; specId: string };

export type FillResult = { slots: FilledSlot[]; skipped: { characterId: string; reason: string }[] };

type Split = { no: number; free: { groupNo: number; position: number }[]; count: Record<Role, number> };

export function autoFill({
  size,
  splits,
  requirements,
  placed,
  candidates,
}: {
  // Size of one split.
  size: number;
  splits: number;
  // Per split.
  requirements: RoleRequirements | null;
  placed: PlacedSlot[];
  candidates: FillCandidate[];
}): FillResult {
  const state: Split[] = Array.from({ length: splits }, (_, i) => {
    const no = i + 1;
    const taken = new Set(placed.filter((p) => p.splitNo === no).map((p) => `${p.groupNo}-${p.position}`));
    const free = [];
    for (let g = 1; g <= size / 5; g++) {
      for (let p = 1; p <= 5; p++) if (!taken.has(`${g}-${p}`)) free.push({ groupNo: g, position: p });
    }
    const count = { tank: 0, healer: 0, dps: 0 };
    for (const p of placed) if (p.splitNo === no) count[p.role]++;
    return { no, free, count };
  });

  const need = (s: Split, role: Role) =>
    requirements && FIXED_ROLES.includes(role) ? Math.max(0, requirements[role] - s.count[role]) : 0;
  const dpsRoom = (s: Split) => s.free.length - FIXED_ROLES.reduce((n, r) => n + need(s, r), 0);

  const rank = (a: FillCandidate, b: FillCandidate) =>
    (b.attendance ?? -1) - (a.attendance ?? -1) || Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name);
  const remaining = [...candidates].filter((c) => c.options.length).sort(rank);
  const slots: FilledSlot[] = [];

  function place(c: FillCandidate, s: Split, role: Role) {
    const option = c.options.find((o) => o.role === role)!;
    const spot = s.free.shift()!;
    s.count[role]++;
    slots.push({ characterId: c.id, splitNo: s.no, ...spot, role, specId: option.specId });
    remaining.splice(remaining.indexOf(c), 1);
  }

  // Best candidate for a role in a split: players whose own role it is first, then those who can switch.
  function pick(role: Role, eligible: (c: FillCandidate) => boolean) {
    return (
      remaining.find((c) => eligible(c) && c.options[0].role === role) ??
      remaining.find((c) => eligible(c) && c.options.some((o) => o.role === role))
    );
  }

  function step(eligible: (c: FillCandidate, s: Split) => boolean) {
    for (const role of FIXED_ROLES) {
      for (const s of [...state].sort((a, b) => need(b, role) - need(a, role))) {
        while (need(s, role) > 0) {
          const c = pick(role, (c) => eligible(c, s));
          if (!c) break;
          place(c, s, role);
        }
      }
    }
    for (const s of [...state].sort((a, b) => dpsRoom(b) - dpsRoom(a))) {
      while (dpsRoom(s) > 0) {
        const c = pick("dps", (c) => eligible(c, s));
        if (!c) break;
        place(c, s, "dps");
      }
    }
  }

  // 1. Duties: the role stages, then a spot in their own role if they didn't fit one.
  step((c, s) => c.dutySplit === s.no);
  for (const c of remaining.filter((c) => c.dutySplit)) {
    const s = state.find((s) => s.no === c.dutySplit);
    if (s?.free.length) place(c, s, c.options[0].role);
  }
  // 2. Standing rosters.
  if (splits > 1) step((c, s) => c.rosterSplit === s.no);
  // 3. Everyone else.
  step(() => true);
  // Leftover spots, e.g. no tank signed up: better a third healer than an empty spot.
  for (const s of state) {
    while (s.free.length && remaining.length) place(remaining[0], s, remaining[0].options[0].role);
  }

  const skipped = remaining.map((c) => {
    const role = ROLE_NAMES[c.options[0].role].toLowerCase();
    return {
      characterId: c.id,
      reason: `Over the ${role} limit${c.attendance !== null ? ` · ${c.attendance}% attendance` : ""}`,
    };
  });
  return { slots, skipped };
}
