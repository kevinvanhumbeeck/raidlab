import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, ROLE_LABELS, isLocked, primaryRole, type Role } from "@/lib/wow";

// The Discord bot (#49) announces raids in a channel, with buttons to sign up. Button clicks arrive at
// /api/discord/interactions; messages are posted and edited through Discord's REST API with the bot token.
// Without DISCORD_BOT_TOKEN and DISCORD_RAID_CHANNEL_ID the bot is off and nothing is posted.

const API = "https://discord.com/api/v10";

export const SITE_URL = process.env.SITE_URL ?? "https://www.raidlab.net";

export function botEnabled() {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_RAID_CHANNEL_ID);
}

async function discord(method: string, path: string, body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

// Discord signs every interaction with the application's Ed25519 key.
export async function verifyInteraction(body: string, signature: string | null, timestamp: string | null) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

type RaidForMessage = {
  id: string;
  slug: string;
  title: string;
  instance: string;
  starts_at: string;
  locked_at: string | null;
  notes: string | null;
  discord_message_id: string | null;
};

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// Embed with the raid's time and who's in per role, plus the sign-up buttons.
async function buildMessage(raid: RaidForMessage) {
  const admin = createAdminClient()!;
  const [{ data: signups }, { data: specs }, { data: instance }] = await Promise.all([
    admin.from("signups").select("status, spec_id, characters(name, main_spec_id)").eq("raid_id", raid.id),
    admin.from("specs").select("id, roles"),
    admin.from("instances").select("tanks, healers, dps").eq("name", raid.instance).maybeSingle(),
  ]);
  const specById = new Map(specs?.map((s) => [s.id, s]));

  const byRole: Record<Role, string[]> = { tank: [], healer: [], dps: [] };
  let declined = 0;
  for (const s of (signups ?? []) as unknown as {
    status: string;
    spec_id: string | null;
    characters: { name: string; main_spec_id: string } | null;
  }[]) {
    if (!s.characters) continue;
    if (s.status !== "accepted") {
      declined++;
      continue;
    }
    byRole[primaryRole(specById.get(s.spec_id ?? s.characters.main_spec_id))].push(s.characters.name);
  }
  const needed: Record<Role, number | undefined> = {
    tank: instance?.tanks,
    healer: instance?.healers,
    dps: instance?.dps,
  };

  const locked = isLocked(raid);
  const url = `${SITE_URL}/raids/${raid.slug}`;
  const accepted = ROLES.reduce((n, r) => n + byRole[r].length, 0);
  const description = [
    `**${raid.instance}** · <t:${unix(raid.starts_at)}:F> (<t:${unix(raid.starts_at)}:R>)`,
    raid.notes,
    locked ? "🔒 Sign-ups are locked." : raid.locked_at ? `Sign-ups close <t:${unix(raid.locked_at)}:R>.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    embeds: [
      {
        title: raid.title,
        url,
        description,
        color: 0xf59e0b,
        fields: [
          ...ROLES.map((role) => ({
            name: `${ROLE_LABELS[role]} ${byRole[role].length}${needed[role] ? ` / ${needed[role]}` : ""}`,
            value: byRole[role].sort().join(", ").slice(0, 1024) || "—",
            inline: role !== "dps",
          })),
        ],
        footer: { text: `${accepted} in · ${declined} declined` },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: "In", emoji: { name: "✅" }, custom_id: `in:${raid.id}`, disabled: locked },
          { type: 2, style: 2, label: "Out", emoji: { name: "❌" }, custom_id: `out:${raid.id}`, disabled: locked },
          { type: 2, style: 2, label: "Character / spec", custom_id: `spec:${raid.id}`, disabled: locked },
          { type: 2, style: 5, label: "Open in RaidLab", url },
        ],
      },
    ],
  };
}

const RAID_FIELDS = "id, slug, title, instance, starts_at, locked_at, notes, discord_message_id";

// Posts the raid's announcement, or updates it. A message deleted in Discord is posted again.
export async function syncRaidMessage(raidId: string) {
  if (!botEnabled()) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data: raid } = await admin.from("raids").select(RAID_FIELDS).eq("id", raidId).maybeSingle();
  if (!raid) return;

  const message = await buildMessage(raid);
  const channel = process.env.DISCORD_RAID_CHANNEL_ID;
  if (raid.discord_message_id) {
    const res = await discord("PATCH", `/channels/${channel}/messages/${raid.discord_message_id}`, message);
    if (res.ok) return;
    if (res.status !== 404) {
      console.error("Discord: updating the raid message failed", res.status, await res.text());
      return;
    }
  }
  const res = await discord("POST", `/channels/${channel}/messages`, message);
  if (!res.ok) {
    console.error("Discord: posting the raid message failed", res.status, await res.text());
    return;
  }
  const { id } = (await res.json()) as { id: string };
  await admin.from("raids").update({ discord_message_id: id }).eq("id", raidId);
}

// Discord allows at most 100 users in allowed_mentions; 50 per message also stays well under 2000 characters.
const MENTIONS_PER_MESSAGE = 50;

// Officers ping the members who haven't responded (#58): one message in the raid channel mentioning them, as a
// reply to the raid's announcement so the buttons are one click away. Returns whether every message went out.
export async function mentionInChannel(
  raid: { slug: string; title: string; starts_at: string; discord_message_id: string | null },
  discordIds: string[],
) {
  if (!botEnabled()) return false;
  const channel = process.env.DISCORD_RAID_CHANNEL_ID;
  const text = `haven't signed up for **${raid.title}** <t:${unix(raid.starts_at)}:R> yet. Sign up with the buttons above or at ${SITE_URL}/raids/${raid.slug}`;
  for (let i = 0; i < discordIds.length; i += MENTIONS_PER_MESSAGE) {
    const ids = discordIds.slice(i, i + MENTIONS_PER_MESSAGE);
    const res = await discord("POST", `/channels/${channel}/messages`, {
      content: `${ids.map((id) => `<@${id}>`).join(" ")} ${text}`,
      allowed_mentions: { users: ids },
      message_reference: raid.discord_message_id
        ? { message_id: raid.discord_message_id, fail_if_not_exists: false }
        : undefined,
    });
    if (!res.ok) {
      console.error("Discord: pinging the raid channel failed", res.status, await res.text());
      return false;
    }
  }
  return true;
}

export async function deleteRaidMessage(messageId: string | null) {
  if (!botEnabled() || !messageId) return;
  await discord("DELETE", `/channels/${process.env.DISCORD_RAID_CHANNEL_ID}/messages/${messageId}`);
}
