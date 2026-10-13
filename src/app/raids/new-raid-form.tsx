"use client";

import { useState } from "react";
import { ROLES, ROLE_REQUIREMENT_KEYS, ROLE_SHORT, type Instance } from "@/lib/wow";
import { createRaid } from "./actions";
import { RaidDatePicker } from "./raid-date-picker";

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function NewRaidForm({ instances }: { instances: Instance[] }) {
  const [picked, setPicked] = useState(false);

  return (
    <form action={createRaid} className="grid gap-4 rounded border border-border bg-panel p-4 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-sm">Instance</span>
        <select name="instance" required className={input}>
          {instances.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name} ({i.size}) — {ROLES.map((r) => `${i[ROLE_REQUIREMENT_KEYS[r]]} ${ROLE_SHORT[r]}`).join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-1 sm:row-span-3">
        <span className="text-sm">Start</span>
        <RaidDatePicker onPick={() => setPicked(true)} />
      </div>
      <label className="space-y-1">
        <span className="text-sm">Title (optional)</span>
        <input name="title" placeholder="e.g. Hyjal week 1" className={input} />
      </label>
      <label className="space-y-1">
        <span className="text-sm">Notes (optional)</span>
        <input name="notes" placeholder="Flasks required, invites 19:45" className={input} />
      </label>
      <div className="sm:col-span-2">
        <button
          disabled={!picked}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent"
        >
          Create raid
        </button>
      </div>
    </form>
  );
}
