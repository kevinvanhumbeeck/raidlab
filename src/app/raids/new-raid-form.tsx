"use client";

import { useState } from "react";
import { INSTANCES } from "@/lib/wow";
import { createRaid } from "./actions";

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function NewRaidForm() {
  const [localTime, setLocalTime] = useState("");

  return (
    <form action={createRaid} className="grid gap-4 rounded border border-border bg-panel p-4 sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-sm">Instance</span>
        <select name="instance" required className={input}>
          {INSTANCES.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name} ({i.size})
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Start (your local time)</span>
        <input
          type="datetime-local"
          required
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          className={input}
        />
        {/* Convert in the browser so the server stores the right instant. */}
        <input type="hidden" name="starts_at" value={localTime ? new Date(localTime).toISOString() : ""} />
      </label>
      <label className="space-y-1">
        <span className="text-sm">Title (optional)</span>
        <input name="title" placeholder="e.g. Hyjal week 1" className={input} />
      </label>
      <label className="space-y-1">
        <span className="text-sm">Notes (optional)</span>
        <input name="notes" placeholder="Flasks required, invites 19:45" className={input} />
      </label>
      <div className="sm:col-span-2">
        <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">Create raid</button>
      </div>
    </form>
  );
}
