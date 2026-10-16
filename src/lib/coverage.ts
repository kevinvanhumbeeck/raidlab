import { FIXED_ROLES, ROLES, type Role, type RoleRequirements } from "@/lib/wow";

// Whether a raid has its tanks and healers (#45): as signed up, only if some players switch to another role
// they can play (an offspec, or another role of their spec), or not at all. DPS has no minimum (#27), so any
// dps can switch.

export type CoverageState = "met" | "offspec" | "short";

export type CoveragePlayer = {
  id: string;
  name: string;
  role: Role;
  // Every role the player can fill, with the spec they'd play it in (see roleOptions).
  options: RoleOption[];
};

export type RoleOption = { role: Role; specName: string };

export type Switch = { id: string; name: string; from: Role; to: Role; specName: string };

export type Coverage = { states: Record<Role, CoverageState>; switches: Switch[] };

export function roleCoverage(players: CoveragePlayer[], requirements: RoleRequirements | null): Coverage {
  const roleOf = new Map(players.map((p) => [p.id, p.role]));
  const count = (role: Role) => players.filter((p) => roleOf.get(p.id) === role).length;
  const minimum = (role: Role) => (requirements && FIXED_ROLES.includes(role) ? requirements[role] : 0);
  const shortBefore = new Set(ROLES.filter((r) => count(r) < minimum(r)));

  // Fill each missing spot with a shortest chain of switches that ends in a role with players to spare,
  // e.g. a healer goes tank and a dps with a healing offspec takes their place. Augmenting paths like
  // these find the most spots that can be covered.
  for (const role of ROLES) {
    while (count(role) < minimum(role)) {
      const path = findPath(role, players, roleOf, (r) => count(r) > minimum(r));
      if (!path) break;
      for (const { id, to } of path) roleOf.set(id, to);
    }
  }

  const states = Object.fromEntries(
    ROLES.map((r) => [r, !shortBefore.has(r) ? "met" : count(r) >= minimum(r) ? "offspec" : "short"]),
  ) as Record<Role, CoverageState>;

  const switches = players.flatMap((p) => {
    const to = roleOf.get(p.id)!;
    if (to === p.role) return [];
    return [{ id: p.id, name: p.name, from: p.role, to, specName: p.options.find((o) => o.role === to)!.specName }];
  });

  return { states, switches };
}

// Breadth-first over roles: from the short role, move a player in from another role, and keep going until a
// role is reached that can give a player away.
function findPath(
  target: Role,
  players: CoveragePlayer[],
  roleOf: Map<string, Role>,
  hasSpare: (role: Role) => boolean,
) {
  const via = new Map<Role, { id: string; from: Role }>();
  const queue: Role[] = [target];
  const seen = new Set<Role>([target]);
  while (queue.length) {
    const to = queue.shift()!;
    // Prefer the least flexible player, so players who can fill several roles stay available.
    const candidates = players
      .filter((p) => roleOf.get(p.id) !== to && p.options.some((o) => o.role === to))
      .sort((a, b) => a.options.length - b.options.length || a.name.localeCompare(b.name));
    for (const p of candidates) {
      const from = roleOf.get(p.id)!;
      if (seen.has(from)) continue;
      seen.add(from);
      via.set(from, { id: p.id, from: to });
      if (hasSpare(from)) {
        const path: { id: string; to: Role }[] = [];
        for (let r: Role = from; r !== target; ) {
          const step = via.get(r)!;
          path.push({ id: step.id, to: step.from });
          r = step.from;
        }
        return path;
      }
      queue.push(from);
    }
  }
  return null;
}

// "Thrall tanks (Protection)"
export function describeSwitch(s: Switch) {
  const verb: Record<Role, string> = { tank: "tanks", healer: "heals", dps: "plays dps" };
  return `${s.name} ${verb[s.to]} (${s.specName})`;
}

// One line for the whole raid. All switches are listed together, since one can depend on another
// (a healer tanks, so a dps has to heal).
export function coverageSummary({ states, switches }: Coverage) {
  if (!switches.length) return undefined;
  const list = switches.map(describeSwitch).join(", ");
  return Object.values(states).includes("short")
    ? `Still short, even if ${list}`
    : `Tanks and healers covered if ${list}`;
}

// Roles a character can fill: those of its signed-up spec first, then its main and offspecs. Each role
// keeps the first spec found, so playing another role of the same spec wins over a respec.
export function roleOptions(
  specIds: (string | null | undefined)[],
  specById: Map<string, { name: string; roles: string[] }>,
): RoleOption[] {
  const out = new Map<Role, string>();
  for (const id of specIds) {
    const spec = id ? specById.get(id) : undefined;
    for (const r of (spec?.roles ?? []) as Role[]) if (!out.has(r)) out.set(r, spec!.name);
  }
  return [...out].map(([role, specName]) => ({ role, specName }));
}
