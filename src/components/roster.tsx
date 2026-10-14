import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardHeader, StatTile } from "@/components/card";
import { SpecIcon } from "@/components/spec-icon";
import { ROLES, ROLE_LABELS, playerHref, primaryRole, type Role } from "@/lib/wow";

type CharacterRow = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  off_spec_ids: string[];
  is_main: boolean;
  owner_id: string;
  profiles: { display_name: string } | null;
};

export async function Roster({ supabase }: { supabase: SupabaseClient }) {
  const [{ data: classes }, { data: specs }, { data: characters }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name, roles").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main, owner_id, profiles(display_name)")
      .order("name")
      .overrideTypes<CharacterRow[], { merge: false }>(),
  ]);

  const all = characters ?? [];
  const mains = all.filter((c) => c.is_main);
  const specById = new Map(specs?.map((s) => [s.id, s]));

  const mainCount = (specId: string) => mains.filter((c) => c.main_spec_id === specId).length;
  const offCount = (specId: string) => all.filter((c) => c.off_spec_ids.includes(specId)).length;
  const altCount = (specId: string) => all.filter((c) => !c.is_main && c.main_spec_id === specId).length;

  const roleCount = (role: Role) => mains.filter((c) => primaryRole(specById.get(c.main_spec_id)) === role).length;
  const missing = (specs ?? []).filter((s) => mainCount(s.id) === 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="Mains" value={mains.length} />
          <StatTile label="Alts" value={all.length - mains.length} />
          {ROLES.map((role) => (
            <StatTile key={role} label={ROLE_LABELS[role]} value={roleCount(role)} hint="mains" />
          ))}
        </div>
        {missing.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-amber-400">
            No main for:
            {missing.map((s) => (
              <SpecIcon
                key={s.id}
                specId={s.id}
                name={`${s.name} ${classes?.find((c) => c.id === s.class_id)?.name}`}
              />
            ))}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spec coverage</h2>
        <p className="text-xs text-muted">Mains · alts · players with it as off-spec</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes?.map((cls) => (
            <Card key={cls.id}>
              <CardHeader title={cls.name} style={{ color: cls.color }} />
              <ul className="divide-y divide-border text-sm">
                {specs
                  ?.filter((s) => s.class_id === cls.id)
                  .map((s) => {
                    const m = mainCount(s.id);
                    return (
                      <li key={s.id} className="flex items-center gap-2 px-4 py-2">
                        <SpecIcon specId={s.id} name={s.name} />
                        <span className={m === 0 ? "text-amber-400" : ""}>{s.name}</span>
                        <span className="ml-auto tabular-nums">
                          <strong className={m === 0 ? "text-amber-400" : ""}>{m}</strong>
                          <span className="text-muted">
                            {" "}
                            · {altCount(s.id)} · {offCount(s.id)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </Card>
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
                <Card key={cls.id}>
                  <CardHeader
                    title={cls.name}
                    style={{ color: cls.color }}
                    action={<span className="text-xs tabular-nums text-muted">{inClass.length}</span>}
                  />
                  <ul className="divide-y divide-border text-sm">
                    {inClass.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                        <SpecIcon specId={c.main_spec_id} name={specById.get(c.main_spec_id)?.name ?? ""} />
                        <Link
                          href={playerHref(c.owner_id, c.id)}
                          className="font-medium hover:underline"
                          style={{ color: cls.color }}
                        >
                          {c.name}
                        </Link>
                        {!c.is_main && <span className="text-xs text-muted">alt</span>}
                        {c.profiles && c.profiles.display_name !== c.name && (
                          <span className="ml-auto text-xs text-muted">{c.profiles.display_name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
