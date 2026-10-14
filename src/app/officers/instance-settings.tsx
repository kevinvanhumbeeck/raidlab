import Link from "next/link";
import { INSTANCE_SIZES, ROLES, ROLE_LABELS, ROLE_REQUIREMENT_KEYS, type Instance } from "@/lib/wow";
import { addInstance, saveInstance } from "./actions";

const number = "w-16 rounded border border-border bg-background px-2 py-1 text-right tabular-nums";

type InstanceRow = Instance & { reserves: number };

function Fields({ instance }: { instance?: InstanceRow }) {
  return (
    <>
      <label className="space-y-1 text-xs">
        <span className="block opacity-70">Size</span>
        <select name="size" defaultValue={instance?.size ?? 10} className={number.replace("w-16", "w-20")}>
          {INSTANCE_SIZES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {ROLES.map((role) => (
        <label key={role} className="space-y-1 text-xs">
          <span className="block opacity-70">{ROLE_LABELS[role]}</span>
          <input
            type="number"
            min={0}
            max={40}
            name={ROLE_REQUIREMENT_KEYS[role]}
            defaultValue={instance?.[ROLE_REQUIREMENT_KEYS[role]] ?? 0}
            className={number}
          />
        </label>
      ))}
      <label className="space-y-1 text-xs">
        <span className="block opacity-70">Reserves</span>
        <input
          type="number"
          min={0}
          max={10}
          name="reserves"
          defaultValue={instance?.reserves ?? 2}
          className={number}
        />
      </label>
    </>
  );
}

// Officer settings: minimum players per role and soft reserves for each raid instance.
export function InstanceSettings({ instances }: { instances: InstanceRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Raid instances</h2>
      <p className="text-sm opacity-70">
        Minimum players per role. Comp boards and sign-up pages show how far each raid is from these numbers; the rest
        of the raid is flexible. Reserves is how many items each player can soft-reserve per raid.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-panel">
        {instances.map((instance) => {
          const flexible =
            instance.size - ROLES.reduce((sum, role) => sum + instance[ROLE_REQUIREMENT_KEYS[role]], 0);
          return (
            <li key={instance.name} className="px-4 py-3">
              <form action={saveInstance} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="name" value={instance.name} />
                <div className="min-w-40 pb-1">
                  <div className="font-medium">{instance.name}</div>
                  <div className="text-xs opacity-60">
                    {flexible} flexible ·{" "}
                    <Link href={`/officers/loot/${encodeURIComponent(instance.name)}`} className="hover:underline">
                      Loot table
                    </Link>
                  </div>
                </div>
                <Fields instance={instance} />
                <button className="rounded border border-border px-3 py-1 text-sm hover:bg-white/5">Save</button>
              </form>
            </li>
          );
        })}
        <li className="px-4 py-3">
          <form action={addInstance} className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 space-y-1 text-xs">
              <span className="block opacity-70">New instance</span>
              <input
                name="name"
                required
                placeholder="Name"
                className="w-40 rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <Fields />
            <button className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              Add
            </button>
          </form>
        </li>
      </ul>
    </section>
  );
}
