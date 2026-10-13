import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCharacter, deleteCharacter } from "./actions";

export default async function CharactersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: classes }, { data: specs }, { data: characters }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name, roles").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main")
      .eq("owner_id", user.id)
      .order("is_main", { ascending: false }),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">My characters</h1>
        {characters?.length ? (
          <ul className="divide-y divide-border rounded border border-border bg-panel">
            {characters.map((ch) => (
              <li key={ch.id} className="flex items-center gap-4 px-4 py-3">
                <span className="font-medium" style={{ color: classById.get(ch.class_id)?.color }}>
                  {ch.name}
                </span>
                <span className="text-sm opacity-80">
                  {specById.get(ch.main_spec_id)?.name} {classById.get(ch.class_id)?.name}
                  {ch.off_spec_ids.length > 0 &&
                    ` · off-spec: ${ch.off_spec_ids.map((id: string) => specById.get(id)?.name).join(", ")}`}
                </span>
                {!ch.is_main && <span className="text-xs opacity-60">alt</span>}
                <form action={deleteCharacter} className="ml-auto">
                  <input type="hidden" name="id" value={ch.id} />
                  <button className="text-sm text-red-400 hover:text-red-300">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="opacity-70">No characters yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a character</h2>
        <form action={addCharacter} className="space-y-4 rounded border border-border bg-panel p-4">
          <label className="block space-y-1">
            <span className="text-sm">Name</span>
            <input
              name="name"
              required
              className="w-full rounded border border-border bg-background px-2 py-1.5"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Main spec</span>
            <select
              name="main_spec_id"
              required
              className="w-full rounded border border-border bg-background px-2 py-1.5"
            >
              {classes?.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {specs
                    ?.filter((s) => s.class_id === c.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <fieldset className="space-y-1">
            <legend className="text-sm">Off-specs (same class only)</legend>
            <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
              {specs?.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" name="off_spec_ids" value={s.id} />
                  <span style={{ color: classById.get(s.class_id)?.color }}>
                    {s.name} {classById.get(s.class_id)?.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_main" defaultChecked />
            Main character
          </label>
          <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">Add</button>
        </form>
      </section>
    </div>
  );
}
