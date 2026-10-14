import { CharacterSpecs } from "@/components/spec-icon";
import { requireViewer } from "@/lib/viewer";
import { CharacterForm } from "./character-form";

export default async function CharactersPage() {
  const { supabase, user } = await requireViewer();

  const [{ data: classes }, { data: specs }, { data: characters }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main")
      .eq("owner_id", user.id)
      .order("is_main", { ascending: false })
      .order("name"),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">My characters</h1>
        {characters?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel">
            {characters.map((ch) => (
              <li key={ch.id} className="px-4 py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                    <CharacterSpecs
                      mainSpecId={ch.main_spec_id}
                      offSpecIds={ch.off_spec_ids}
                      specName={(id) => specById.get(id)?.name ?? ""}
                    />
                    <span className="font-medium" style={{ color: classById.get(ch.class_id)?.color }}>
                      {ch.name}
                    </span>
                    {!ch.is_main && <span className="text-xs opacity-60">alt</span>}
                    <span className="ml-auto text-sm text-accent group-open:hidden">Edit</span>
                    <span className="ml-auto hidden text-sm opacity-70 group-open:inline">Close</span>
                  </summary>
                  <div className="mt-3">
                    <CharacterForm classes={classes ?? []} specs={specs ?? []} character={ch} />
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
        <CharacterForm classes={classes ?? []} specs={specs ?? []} />
      </section>
    </div>
  );
}
