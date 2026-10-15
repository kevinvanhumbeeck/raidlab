// Shared WoW Forever constants and helpers.

// Raid times are shown in realm (server) time.
export const REALM_TIMEZONE = "Europe/Paris";

export const ROLES = ["tank", "healer", "dps"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  tank: "Tanks",
  healer: "Healers",
  dps: "DPS",
};

// Singular, for a single player's role.
export const ROLE_NAMES: Record<Role, string> = { tank: "Tank", healer: "Healer", dps: "DPS" };

export const ROLE_SHORT: Record<Role, string> = { tank: "T", healer: "H", dps: "D" };

// Raid sizes; 5 is for dungeons standing in for raids while testing (Ragefire Chasm).
export const INSTANCE_SIZES = [5, 10, 20, 40];

// A raid instance and the minimum number of players per role it needs (table "instances").
export type Instance = { name: string; size: number; tanks: number; healers: number; dps: number };

// Column in "instances" holding the requirement for each role.
export const ROLE_REQUIREMENT_KEYS: Record<Role, "tanks" | "healers" | "dps"> = {
  tank: "tanks",
  healer: "healers",
  dps: "dps",
};

export type RoleRequirements = Record<Role, number>;

export function requirementsOf(instance: Instance | null | undefined): RoleRequirements | null {
  if (!instance) return null;
  return {
    tank: instance.tanks,
    healer: instance.healers,
    dps: instance.dps,
  };
}

// The role a spec fills unless an officer picked another one it can do.
export function primaryRole(spec: { roles: string[] } | null | undefined): Role {
  return (spec?.roles[0] ?? "dps") as Role;
}

export function effectiveRole(spec: { roles: string[] } | null | undefined, override: Role | null | undefined): Role {
  return override && spec?.roles.includes(override) ? override : primaryRole(spec);
}

// No sign-up means no response. Bench isn't a sign-up state: it's signed up but not placed in the comp.
export const SIGNUP_STATUSES = ["accepted", "declined"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const STATUS_LABELS: Record<SignupStatus, string> = {
  accepted: "Accepted",
  declined: "Declined",
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

// Best to worst. Absent is a missed raid; a no-show signed up as accepted and didn't come.
export const ATTENDANCE_STATUSES = ["present", "benched", "absent", "no_show"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  benched: "Benched",
  absent: "Absent",
  no_show: "No-show",
};

export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  benched: "bg-sky-500",
  absent: "bg-zinc-400",
  no_show: "bg-red-500",
};

// Benched players showed up and were available, so they count as attended.
export const COUNTS_AS_ATTENDED: AttendanceStatus[] = ["present", "benched"];

export const STATUS_DOT: Record<SignupStatus, string> = {
  accepted: "bg-emerald-500",
  declined: "bg-zinc-400",
};

// Wall-clock parts of an instant in realm time.
function realmParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REALM_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// Today's date in realm time, as "YYYY-MM-DD".
export function realmToday() {
  const { year, month, day } = realmParts(Date.now());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The instant a realm-time date ("YYYY-MM-DD") and time ("HH:MM") refer to.
export function realmTimeToDate(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms: number) => {
    const p = realmParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  // Check the offset again at the result, in case a DST change falls in between.
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

export function hasStarted(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

// A raid is locked from its locked_at on (by default 1 hour before it starts). Null means an officer reopened it.
export function isLocked(raid: { locked_at: string | null }) {
  return raid.locked_at !== null && hasStarted(raid.locked_at);
}

// Profile page of the player owning a character, opened on that character.
export function playerHref(playerSlug: string, characterName?: string) {
  return characterName
    ? `/players/${playerSlug}?character=${encodeURIComponent(characterName.toLowerCase())}`
    : `/players/${playerSlug}`;
}
