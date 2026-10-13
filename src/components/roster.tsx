import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/wow";

type CharacterRow = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  off_spec_ids: string[];
  is_main: boolean;
  profiles: { display_name: string } | null;
};

export async function Roster({ supabase }: { supabase: SupabaseClient }) {
  const [{ data: classes }, { data: specs }, { data: characters }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name, roles").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main, profiles(display_name)")
      .order("name")
      .overrideTypes<CharacterRow[], { merge: false }>(),
  ]);

  const all = characters ?? [];
  const mains = all.filter((c) => c.is_main);
  const specById = new Map(specs?.map((s) => [s.id, s]));

  const mainCount = (specId: string) => mains.filter((c) => c.main_spec_id === specId).length;
  const offCount = (specId: string) => all.filter((c) => c.off_spec_ids.includes(specId)).length;
  const altCount = (specId: string) => all.filter((c) => !c.is_main && c.main_spec_id === specId).length;

  const roleCount = (role: Role) =>
    mains.filter((c) => (specById.get(c.main_spec_id)?.roles[0] ?? "melee") === role).length;
  const missing = (specs ?? []).filter((s) => mainCount(s.id) === 0);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Guild roster</h2>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="font-semibold">
            {mains.length} main{mains.length === 1 ? "" : "s"}, {all.length - mains.length} alt
            {all.length - mains.length === 1 ? "" : "s"}
          </span>
          {ROLES.map((role) => (
            <span key={role}>
              {ROLE_LABELS[role]}: <strong>{roleCount(role)}</strong>
            </span>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="text-sm text-amber-400">
            No main for: {missing.map((s) => `${s.name} ${classes?.find((c) => c.id === s.class_id)?.name}`).join(", ")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spec coverage</h2>
        <p className="text-xs opacity-70">Mains · alts · players with it as off-spec</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes?.map((cls) => (
            <div key={cls.id} className="rounded border border-border bg-panel p-3">
              <h3 className="mb-2 font-semibold" style={{ color: cls.color }}>
                {cls.name}
              </h3>
              <ul className="space-y-1 text-sm">
                {specs
                  ?.filter((s) => s.class_id === cls.id)
                  .map((s) => {
                    const m = mainCount(s.id);
                    return (
                      <li key={s.id} className="flex items-center gap-2">
                        <span className={m === 0 ? "text-amber-400" : ""}>{s.name}</span>
                        <span className="ml-auto tabular-nums">
                          <strong className={m === 0 ? "text-amber-400" : ""}>{m}</strong>
                          <span className="opacity-60"> · {altCount(s.id)} · {offCount(s.id)}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        {all.length === 0 ? (
          <p className="opacity-70">Nobody has registered a character yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes?.map((cls) => {
              const inClass = all
                .filter((c) => c.class_id === cls.id)
                .sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.name.localeCompare(b.name));
              if (!inClass.length) return null;
              return (
                <div key={cls.id} className="rounded border border-border bg-panel p-3">
                  <h3 className="mb-2 font-semibold" style={{ color: cls.color }}>
                    {cls.name} ({inClass.length})
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {inClass.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium" style={{ color: cls.color }}>
                          {c.name}
                        </span>
                        <span className="opacity-80">{specById.get(c.main_spec_id)?.name}</span>
                        {c.off_spec_ids.length > 0 && (
                          <span className="text-xs opacity-60">
                            / {c.off_spec_ids.map((id) => specById.get(id)?.name).join(", ")}
                          </span>
                        )}
                        {!c.is_main && <span className="text-xs opacity-60">alt</span>}
                        {c.profiles && c.profiles.display_name !== c.name && (
                          <span className="ml-auto text-xs opacity-60">{c.profiles.display_name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
