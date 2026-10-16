import { CharacterSpecs } from "@/components/spec-icon";
import { botEnabled } from "@/lib/discord-bot";
import { requireViewer } from "@/lib/viewer";
import { setDiscordDms } from "./actions";
import { CharacterForm } from "./character-form";
import { readable } from "@/lib/theme";

export default async function CharactersPage() {
  const { supabase, user } = await requireViewer();

  const [{ data: classes }, { data: specs }, { data: characters }, { data: profile }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main")
      .eq("owner_id", user.id)
      .order("is_main", { ascending: false })
      .order("name"),
    supabase.from("profiles").select("discord_dms").eq("id", user.id).single(),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const main = characters?.find((c) => c.is_main);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">My characters</h1>
        {characters?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
            {characters.map((ch) => (
              <li key={ch.id} className="px-4 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                    <CharacterSpecs
                      mainSpecId={ch.main_spec_id}
                      offSpecIds={ch.off_spec_ids}
                      specName={(id) => specById.get(id)?.name ?? ""}
                    />
                    <span className="font-medium" style={{ color: readable(classById.get(ch.class_id)?.color) }}>
                      {ch.name}
                    </span>
                    {!ch.is_main && <span className="text-xs opacity-60">alt</span>}
                    <span className="ml-auto text-sm text-accent group-open:hidden">Edit</span>
                    <span className="ml-auto hidden text-sm opacity-70 group-open:inline">Close</span>
                  </summary>
                  <div className="mt-3">
                    <CharacterForm
                      classes={classes ?? []}
                      specs={specs ?? []}
                      character={ch}
                      currentMain={main && main.id !== ch.id ? main.name : undefined}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="opacity-70">No characters yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a character</h2>
        <CharacterForm classes={classes ?? []} specs={specs ?? []} currentMain={main?.name} />
      </section>

      {botEnabled() && profile && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Discord reminders</h2>
          <form
            action={setDiscordDms.bind(null, !profile.discord_dms)}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel/90 p-4 text-sm"
          >
            <span className="flex-1">
              {profile.discord_dms
                ? "The RaidLab bot DMs you a couple of hours before a raid you haven't signed up for."
                : "You don't get a DM before raids you haven't signed up for."}
            </span>
            <button className="rounded border border-border px-3 py-1.5 hover:bg-foreground/5">
              {profile.discord_dms ? "Turn off" : "Turn on"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
