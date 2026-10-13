// Shared WoW Forever constants and helpers.

// Raid times are shown in realm (server) time.
export const REALM_TIMEZONE = "Europe/Paris";

export const ROLES = ["tank", "healer", "melee", "ranged"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  tank: "Tanks",
  healer: "Healers",
  melee: "Melee",
  ranged: "Ranged",
};

export const ROLE_SHORT: Record<Role, string> = { tank: "T", healer: "H", melee: "M", ranged: "R" };

// A raid instance and the minimum number of players per role it needs (table "instances").
export type Instance = { name: string; size: number; tanks: number; healers: number; melee: number; ranged: number };

// Column in "instances" holding the requirement for each role.
export const ROLE_REQUIREMENT_KEYS: Record<Role, "tanks" | "healers" | "melee" | "ranged"> = {
  tank: "tanks",
  healer: "healers",
  melee: "melee",
  ranged: "ranged",
};

export type RoleRequirements = Record<Role, number>;

export function requirementsOf(instance: Instance | null | undefined): RoleRequirements | null {
  if (!instance) return null;
  return {
    tank: instance.tanks,
    healer: instance.healers,
    melee: instance.melee,
    ranged: instance.ranged,
  };
}

// The role a spec fills unless an officer picked another one it can do.
export function primaryRole(spec: { roles: string[] } | null | undefined): Role {
  return (spec?.roles[0] ?? "melee") as Role;
}

export function effectiveRole(spec: { roles: string[] } | null | undefined, override: Role | null | undefined): Role {
  return override && spec?.roles.includes(override) ? override : primaryRole(spec);
}

export const SIGNUP_STATUSES = ["accepted", "tentative", "bench", "absent"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const STATUS_LABELS: Record<SignupStatus, string> = {
  accepted: "Accepted",
  tentative: "Tentative",
  bench: "Bench",
  absent: "Absent",
};

export function formatRaidTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: REALM_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Raids stay listed as "upcoming" until 12 hours after they start.
export function upcomingCutoff() {
  return new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
}

export const RAID_DUTIES = ["raid_lead", "tank_assist", "heal_assist", "loot_lead"] as const;
export type RaidDuty = (typeof RAID_DUTIES)[number];

export const DUTY_LABELS: Record<RaidDuty, string> = {
  raid_lead: "Raid lead",
  tank_assist: "Tank assist",
  heal_assist: "Heal assist",
  loot_lead: "Loot lead",
};

export const ATTENDANCE_STATUSES = ["present", "late", "benched", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  benched: "Benched",
  absent: "Absent",
};

export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-400",
  benched: "bg-sky-500",
  absent: "bg-red-500",
};

// Benched players showed up and were available, so they count as attended.
export const COUNTS_AS_ATTENDED: AttendanceStatus[] = ["present", "late", "benched"];

export const STATUS_DOT: Record<SignupStatus, string> = {
  accepted: "bg-emerald-500",
  tentative: "bg-amber-400",
  bench: "bg-sky-500",
  absent: "bg-red-500",
};
