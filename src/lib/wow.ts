// Shared WoW Forever constants and helpers.

export const INSTANCES = [
  { name: "Barrow Deeps", size: 10 },
  { name: "Hyjal Summit", size: 20 },
  { name: "Onyxia's Lair", size: 40 },
] as const;

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
