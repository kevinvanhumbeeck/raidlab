"use client";

import { useState } from "react";
import { STATUS_LABELS, SIGNUP_STATUSES, type SignupStatus } from "@/lib/wow";

type Character = { id: string; name: string; specs: { id: string; name: string }[] };

const input = "w-full rounded border border-border bg-background px-2 py-1.5";

export function SignupForm({
  action,
  characters,
  current,
}: {
  action: (formData: FormData) => Promise<void>;
  characters: Character[];
  current?: { characterId: string; specId: string | null; status: SignupStatus; note: string | null };
}) {
  const [characterId, setCharacterId] = useState(current?.characterId ?? characters[0]?.id);
  const character = characters.find((c) => c.id === characterId);

  return (
    <form action={action} className="grid gap-4 rounded border border-border bg-panel p-4 sm:grid-cols-4">
      <label className="space-y-1">
        <span className="text-sm">Character</span>
        <select
          name="character_id"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className={input}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Spec</span>
        <select
          key={characterId}
          name="spec_id"
          defaultValue={current?.characterId === characterId ? (current.specId ?? undefined) : undefined}
          className={input}
        >
          {character?.specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Status</span>
        <select name="status" defaultValue={current?.status ?? "accepted"} className={input}>
          {SIGNUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-sm">Note</span>
        <input name="note" defaultValue={current?.note ?? ""} placeholder="Late 15 min" className={input} />
      </label>
      <div className="sm:col-span-4">
        <button className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          {current ? "Update sign-up" : "Sign up"}
        </button>
      </div>
    </form>
  );
}
