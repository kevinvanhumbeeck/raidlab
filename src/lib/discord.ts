import "server-only";

// Scopes requested at login; guilds.members.read lets us check server membership.
export const DISCORD_SCOPES = "identify email guilds.members.read";

// Whether the user behind this Discord OAuth token is in the guild's server.
// Without DISCORD_GUILD_ID configured, everyone counts as a member.
export async function isGuildMember(providerToken: string | null | undefined) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return true;
  if (!providerToken) return false;

  const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store",
  });
  if (res.ok) return true;
  if (res.status === 404 || res.status === 403) return false;
  throw new Error(`Discord membership check failed (${res.status})`);
}
