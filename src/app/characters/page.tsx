import { CharacterSpecs } from "@/components/spec-icon";
import { requireViewer } from "@/lib/viewer";
import { realmToday } from "@/lib/wow";
import { addAbsence, deleteAbsence } from "./actions";
import { CharacterForm } from "./character-form";

const input = "rounded border border-border bg-background px-2 py-1.5";

// "20 Dec" for a "YYYY-MM-DD" date.
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(date));

export default async function CharactersPage() {
  const { supabase, user } = await requireViewer();

  const today = realmToday();
  const [{ data: classes }, { data: specs }, { data: characters }, { data: absences }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main")
      .eq("owner_id", user.id)
      .order("is_main", { ascending: false })
      .order("name"),
    supabase
      .from("absences")
      .select("id, starts_on, ends_on, note")
      .eq("profile_id", user.id)
      .gte("ends_on", today)
      .order("starts_on"),
  ]);

  const classById = new Map(classes?.map((c) => [c.id, c]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const main = characters?.find((c) => c.is_main);

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
        <h2 className="text-lg font-semibold">Away</h2>
        <p className="text-sm opacity-70">
          Raids in these dates get a declined sign-up for your main, including raids created later. Signing up for
          one of them yourself still works.
        </p>
        {absences && absences.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-panel">
            {absences.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-medium">
                  {a.starts_on === a.ends_on ? formatDay(a.starts_on) : `${formatDay(a.starts_on)} – ${formatDay(a.ends_on)}`}
                </span>
                {a.note && <span className="opacity-70">{a.note}</span>}
                <form action={deleteAbsence} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-red-400 hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={addAbsence}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel p-4 text-sm"
        >
          <label className="space-y-1">
            <span className="block">From</span>
            <input type="date" name="starts_on" required min={today} className={input} />
          </label>
          <label className="space-y-1">
            <span className="block">Until</span>
            <input type="date" name="ends_on" min={today} className={input} />
          </label>
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block">Note</span>
            <input name="note" placeholder="Holiday" maxLength={80} className={`${input} w-full`} />
          </label>
          <button className="rounded bg-accent px-3 py-1.5 font-medium text-accent-foreground hover:bg-accent-hover">
            Add
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a character</h2>
        <CharacterForm classes={classes ?? []} specs={specs ?? []} currentMain={main?.name} />
      </section>
    </div>
  );
}
