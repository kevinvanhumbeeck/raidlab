import "server-only";

// Scopes requested at login; guilds.members.read lets us check server membership and roles.
export const DISCORD_SCOPES = "identify email guilds.members.read";

// Comma-separated Discord role IDs from an env var.
function roleIds(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

// What the user's place in the guild's Discord server grants in the app.
// officer is null when no officer role is configured: officers are then managed in the app only.
export type DiscordAccess = { member: boolean; officer: boolean | null };

// Access comes from the server's roles: @raider, @pug or @officer lets you in, @officer makes you an officer.
// Without role IDs configured, being in the server is enough; without DISCORD_GUILD_ID, everyone gets in.
export async function discordAccess(providerToken: string | null | undefined): Promise<DiscordAccess> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return { member: true, officer: null };
  if (!providerToken) return { member: false, officer: null };

  const officerRoles = roleIds("DISCORD_OFFICER_ROLE_ID");
  const accessRoles = [...roleIds("DISCORD_RAIDER_ROLE_ID"), ...roleIds("DISCORD_PUG_ROLE_ID"), ...officerRoles];

  const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 403) {
    return { member: false, officer: officerRoles.length ? false : null };
  }
  if (!res.ok) throw new Error(`Discord membership check failed (${res.status})`);

  const { roles } = (await res.json()) as { roles: string[] };
  const has = (ids: string[]) => ids.some((id) => roles.includes(id));
  return {
    member: accessRoles.length ? has(accessRoles) : true,
    officer: officerRoles.length ? has(officerRoles) : null,
  };
}

// Whether officers follow the Discord @officer role (and so can't be changed in the app).
export function officersFromDiscord() {
  return Boolean(process.env.DISCORD_GUILD_ID) && roleIds("DISCORD_OFFICER_ROLE_ID").length > 0;
}
