import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { SITE_URL, syncRaidMessage, verifyInteraction } from "@/lib/discord-bot";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocked } from "@/lib/wow";

// Discord interactions (#49): the In / Out / Character-spec buttons on raid announcements. Discord expects
// an answer within 3 seconds; updating the announcement happens after the response.

type Interaction = {
  type: number;
  data?: { custom_id?: string; values?: string[] };
  member?: { user: { id: string } };
  user?: { id: string };
};

const PING = 1;
const COMPONENT = 3;
const EPHEMERAL = 64;

const reply = (content: string, extra: Record<string, unknown> = {}) =>
  Response.json({ type: 4, data: { content, flags: EPHEMERAL, ...extra } });
// Replaces the ephemeral message the select menu was in.
const replace = (content: string) => Response.json({ type: 7, data: { content, components: [] } });

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Character = { id: string; name: string; main_spec_id: string; off_spec_ids: string[] };

export async function POST(request: Request) {
  const body = await request.text();
  const ok = await verifyInteraction(
    body,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
  );
  if (!ok) return new Response("Bad signature", { status: 401 });

  const interaction = JSON.parse(body) as Interaction;
  if (interaction.type === PING) return Response.json({ type: 1 });
  if (interaction.type !== COMPONENT) return reply("Unknown interaction.");

  const admin = createAdminClient();
  if (!admin) return reply("RaidLab isn't configured for Discord yet.");

  const [action, raidId] = (interaction.data?.custom_id ?? "").split(":");
  const discordId = interaction.member?.user.id ?? interaction.user?.id;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_member")
    .eq("discord_id", discordId ?? "")
    .maybeSingle();
  if (!profile?.is_member) {
    return reply(`Log in once at ${SITE_URL} with Discord to link your account, then try again.`);
  }

  const { data: raid } = await admin.from("raids").select("id, slug, locked_at").eq("id", raidId).maybeSingle();
  if (!raid) return reply("This raid no longer exists.");
  if (isLocked(raid)) return reply("Sign-ups for this raid are locked. Ask an officer if something changed.");

  const { data: characters } = await admin
    .from("characters")
    .select("id, name, main_spec_id, off_spec_ids")
    .eq("owner_id", profile.id)
    .order("is_main", { ascending: false })
    .order("created_at");
  if (!characters?.length) return reply(`Add a character first: ${SITE_URL}/characters`);

  const ids = characters.map((c) => c.id);
  const { data: current } = await admin
    .from("signups")
    .select("character_id, spec_id")
    .eq("raid_id", raid.id)
    .in("character_id", ids)
    .maybeSingle();

  const changed = () => {
    after(() => syncRaidMessage(raid.id));
    revalidatePath("/raids/[slug]", "layout");
    revalidatePath("/raids");
  };

  if (action === "in" || action === "out") {
    // Keep the character and spec of an existing sign-up; otherwise the main in its main spec.
    const character = characters.find((c) => c.id === current?.character_id) ?? characters[0];
    const specId = current?.spec_id ?? character.main_spec_id;
    const status = action === "in" ? "accepted" : "declined";
    const error = await save(admin, raid.id, character.id, specId, status, ids);
    if (error) return reply(`Couldn't save: ${error}`);
    changed();
    const specName = await specNameOf(admin, specId);
    return reply(
      status === "accepted"
        ? `You're in on **${character.name}** (${specName}). Use "Character / spec" to change.`
        : `You're out on **${character.name}**.`,
    );
  }

  if (action === "spec") {
    const options = await specOptions(admin, characters);
    return reply("Which character and spec?", {
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: `pick:${raid.id}`,
              placeholder: "Pick a character and spec",
              options: options.slice(0, 25).map((o) => ({
                ...o,
                default: o.value === `${current?.character_id}|${current?.spec_id}`,
              })),
            },
          ],
        },
      ],
    });
  }

  if (action === "pick") {
    const [characterId, specId] = (interaction.data?.values?.[0] ?? "").split("|");
    const character = characters.find((c) => c.id === characterId);
    if (!character || (specId !== character.main_spec_id && !character.off_spec_ids.includes(specId))) {
      return replace("That character or spec isn't yours anymore.");
    }
    const error = await save(admin, raid.id, character.id, specId, "accepted", ids);
    if (error) return replace(`Couldn't save: ${error}`);
    changed();
    return replace(`You're in on **${character.name}** (${await specNameOf(admin, specId)}).`);
  }

  return reply("Unknown button.");
}

// Same rules as signing up on the site: one character per player per raid, and declining takes the
// character out of the comp.
async function save(
  admin: Admin,
  raidId: string,
  characterId: string,
  specId: string,
  status: "accepted" | "declined",
  playerCharacterIds: string[],
) {
  const others = playerCharacterIds.filter((id) => id !== characterId);
  if (others.length) {
    const { error } = await admin.from("signups").delete().eq("raid_id", raidId).in("character_id", others);
    if (error) return error.message;
  }
  const { error } = await admin.from("signups").upsert({
    raid_id: raidId,
    character_id: characterId,
    status,
    spec_id: specId,
    updated_at: new Date().toISOString(),
  });
  if (error) return error.message;
  if (status === "declined") {
    await admin.from("comp_slots").delete().eq("raid_id", raidId).eq("character_id", characterId);
  }
  return null;
}

async function specNameOf(admin: Admin, specId: string) {
  const { data } = await admin.from("specs").select("name").eq("id", specId).maybeSingle();
  return data?.name ?? specId;
}

async function specOptions(admin: Admin, characters: Character[]) {
  const { data: specs } = await admin.from("specs").select("id, name");
  const name = new Map(specs?.map((s) => [s.id, s.name]));
  return characters.flatMap((c) =>
    [c.main_spec_id, ...c.off_spec_ids].map((specId) => ({
      label: `${c.name} — ${name.get(specId) ?? specId}`,
      value: `${c.id}|${specId}`,
    })),
  );
}
