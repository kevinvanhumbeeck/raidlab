import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SpecIcon } from "@/components/spec-icon";
import { readable } from "@/lib/theme";
import { getInstance } from "@/lib/raid";
import { requireViewer } from "@/lib/viewer";
import { MAX_SPLITS, ROLES, primaryRole, rolesText, type Role } from "@/lib/wow";
import { setRosterSplit } from "../../actions";

type CharacterRow = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  is_main: boolean;
  profiles: { display_name: string; is_member: boolean; is_officer: boolean } | null;
};

// Officers keep the standing split rosters for split nights (#60): which split each character usually raids in.
// Exceptions for a single night are made on that raid's comp board.
export default async function SplitRosterPage({ params }: { params: Promise<{ instance: string }> }) {
  const { supabase, isOfficer } = await requireViewer();
  if (!isOfficer) redirect("/");

  const instance = await getInstance((await params).instance, "splits");
  const name = instance.name;

  const [{ data: characters }, { data: roster }, { data: classes }, { data: specs }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, is_main, profiles(display_name, is_member, is_officer)")
      .is("archived_at", null)
      .order("is_main", { ascending: false })
      .order("name")
      .overrideTypes<CharacterRow[], { merge: false }>(),
    supabase.from("split_rosters").select("character_id, split_no").eq("instance", name),
    supabase.from("classes").select("id, color"),
    supabase.from("specs").select("id, name, roles"),
  ]);

  const color = new Map(classes?.map((c) => [c.id, c.color]));
  const specById = new Map(specs?.map((s) => [s.id, s]));
  const splitOf = new Map(roster?.map((r) => [r.character_id, r.split_no]));
  const members = (characters ?? []).filter((c) => c.profiles?.is_member || c.profiles?.is_officer);

  const sections = [
    ...Array.from({ length: MAX_SPLITS }, (_, i) => i + 1)
      .map((splitNo) => ({ splitNo, rows: members.filter((c) => splitOf.get(c.id) === splitNo) }))
      .filter((s) => s.rows.length > 0),
    { splitNo: null, rows: members.filter((c) => !splitOf.has(c.id)) },
  ];

  const roleCounts = (rows: CharacterRow[]) => {
    const count = (role: Role) => rows.filter((c) => primaryRole(specById.get(c.main_spec_id)) === role).length;
    return ROLES.map((role) => rolesText(count(role), role)).join(", ");
  };

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <Breadcrumbs items={[{ label: "Manage", href: "/manage" }, { label: `${instance.name} splits` }]} />
        <h1 className="text-2xl font-semibold">{instance.name} splits</h1>
        <p className="text-sm opacity-70">
          On a split night, each split has {instance.size} players. Put every character in the split they usually raid
          in; the comp board shows it on the bench, and changes for one night are made there.
        </p>
      </section>

      {sections.map(({ splitNo, rows }) => (
        <section key={splitNo ?? "none"} className="space-y-2">
          <h2 className="flex flex-wrap items-baseline gap-x-3 font-semibold">
            {splitNo ? `Split ${splitNo}` : "Not in a split"}
            <span className="text-sm font-normal opacity-60">
              {splitNo ? `${rows.length}/${instance.size} · ${roleCounts(rows)}` : rows.length}
            </span>
          </h2>
          {rows.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border bg-panel/90">
              {rows.map((c) => {
                const spec = specById.get(c.main_spec_id);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                    <SpecIcon specId={c.main_spec_id} name={spec?.name ?? ""} />
                    <span className="font-medium" style={{ color: readable(color.get(c.class_id)) }}>
                      {c.name}
                    </span>
                    <span className="text-xs opacity-60">
                      {c.profiles?.display_name}
                      {!c.is_main && " · alt"}
                    </span>
                    <form className="ml-auto flex gap-1">
                      {Array.from({ length: MAX_SPLITS }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          formAction={setRosterSplit.bind(null, instance.name, c.id, n)}
                          title={`Split ${n}`}
                          className={`w-7 rounded border py-0.5 text-xs ${
                            n === splitNo ? "border-accent text-accent" : "border-border hover:bg-foreground/5"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        formAction={setRosterSplit.bind(null, instance.name, c.id, null)}
                        disabled={!splitNo}
                        title="Not in a split"
                        className="w-7 rounded border border-border py-0.5 text-xs hover:bg-foreground/5 disabled:opacity-30"
                      >
                        –
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
