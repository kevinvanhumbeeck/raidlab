import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardHeader, StatTile } from "@/components/card";
import { SpecIcon } from "@/components/spec-icon";
import { ROLES, ROLE_LABELS, playerHref, primaryRole, type Role } from "@/lib/wow";
import { readable } from "@/lib/theme";

type CharacterRow = {
  id: string;
  name: string;
  class_id: string;
  main_spec_id: string;
  off_spec_ids: string[];
  is_main: boolean;
  owner_id: string;
  profiles: { slug: string; display_name: string } | null;
};

export async function Roster({ supabase }: { supabase: SupabaseClient }) {
  const [{ data: classes }, { data: specs }, { data: characters }] = await Promise.all([
    supabase.from("classes").select("id, name, color").order("name"),
    supabase.from("specs").select("id, class_id, name, roles").order("name"),
    supabase
      .from("characters")
      .select("id, name, class_id, main_spec_id, off_spec_ids, is_main, owner_id, profiles(slug, display_name)")
      .is("archived_at", null)
      .order("name")
      .overrideTypes<CharacterRow[], { merge: false }>(),
  ]);

  const all = characters ?? [];
  const mains = all.filter((c) => c.is_main);
  const specById = new Map(specs?.map((s) => [s.id, s]));

  // Who can play a spec, split by main/alt character and main/off-spec. A character's off-specs
  // never include its main spec, so each character counts once per spec.
  const coverage = (specId: string) => {
    const count = (isMain: boolean, onMainSpec: boolean) =>
      all.filter(
        (c) => c.is_main === isMain && (onMainSpec ? c.main_spec_id === specId : c.off_spec_ids.includes(specId)),
      ).length;
    return {
      main: count(true, true),
      mainOff: count(true, false),
      alt: count(false, true),
      altOff: count(false, false),
    };
  };
  const mainCount = (specId: string) => coverage(specId).main;

  const roleCount = (role: Role) => mains.filter((c) => primaryRole(specById.get(c.main_spec_id)) === role).length;
  const missing = (specs ?? []).filter((s) => mainCount(s.id) === 0);

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="Mains" value={mains.length} />
          <StatTile label="Alts" value={all.length - mains.length} />
          {ROLES.map((role) => (
            <StatTile key={role} label={ROLE_LABELS[role]} value={roleCount(role)} hint="mains" />
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
                    style={{ color: readable(cls.color) }}
                    action={<span className="text-xs tabular-nums text-muted">{inClass.length}</span>}
                  />
                  <ul className="divide-y divide-border text-sm">
                    {inClass.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                        <SpecIcon specId={c.main_spec_id} name={specById.get(c.main_spec_id)?.name ?? ""} />
                        <Link
                          href={playerHref(c.profiles?.slug ?? "", c.name)}
                          className="font-medium hover:underline"
                          style={{ color: readable(cls.color) }}
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spec coverage</h2>
        <p className="text-xs text-muted">
          Mains on their main spec · everyone else who can play it (hover for details)
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes?.map((cls) => (
            <Card key={cls.id}>
              <CardHeader title={cls.name} style={{ color: readable(cls.color) }} />
              <ul className="divide-y divide-border text-sm">
                {specs
                  ?.filter((s) => s.class_id === cls.id)
                  .map((s) => {
                    const c = coverage(s.id);
                    const m = c.main;
                    return (
                      <li key={s.id} className="flex items-center gap-2 px-4 py-2">
                        <SpecIcon specId={s.id} name={s.name} />
                        <span className={m === 0 ? "text-warn" : ""}>{s.name}</span>
                        <span
                          className="ml-auto cursor-help tabular-nums"
                          title={`Mains: ${c.main} main spec, ${c.mainOff} off-spec\nAlts: ${c.alt} main spec, ${c.altOff} off-spec`}
                        >
                          <strong className={m === 0 ? "text-warn" : ""}>{m}</strong>
                          <span className="text-muted"> · {c.mainOff + c.alt + c.altOff}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-warn">
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
    </div>
  );
}
